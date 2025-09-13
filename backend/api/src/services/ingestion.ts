import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { 
  IngestionConfig, 
  ProcessedDocument, 
  DocumentInfo,
  Entity,
  FileEvent 
} from '@autoorganize/types';

export interface IngestionJob {
  id: string;
  type: 'file' | 'directory' | 'batch';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  userId: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
  options: {
    extractEntities: boolean;
    buildRelationships: boolean;
    autoEncrypt?: boolean;
  };
  results: {
    documents: string[];
    entities: string[];
    errors: Array<{ file: string; error: string }>;
  };
  error?: string;
}

export interface FileIngestionRequest {
  filePath: string;
  sourceType: string;
  options: {
    extractEntities: boolean;
    buildRelationships: boolean;
    autoEncrypt?: boolean;
  };
  userId: string;
}

export interface DirectoryIngestionRequest {
  directoryPath: string;
  sourceType: string;
  options: {
    recursive: boolean;
    filePatterns: string[];
    excludePatterns: string[];
    extractEntities: boolean;
    buildRelationships: boolean;
  };
  userId: string;
}

export interface BatchIngestionRequest {
  files: Array<{
    file_path: string;
    source_type: string;
    metadata?: Record<string, any>;
  }>;
  options: {
    extractEntities: boolean;
    buildRelationships: boolean;
    continue_on_error: boolean;
  };
  userId: string;
}

export class DocumentIngestionService extends EventEmitter {
  private jobs: Map<string, IngestionJob> = new Map();
  private activeWorkers: number = 0;
  private maxWorkers: number = 3;
  private queuePaused: boolean = false;
  private processingQueue: IngestionJob[] = [];
  
  private config: IngestionConfig = {
    max_file_size: 100 * 1024 * 1024, // 100MB
    chunk_size: 1000,
    chunk_overlap: 200,
    supported_extensions: [
      'txt', 'md', 'pdf', 'docx', 'html', 'csv', 'json', 'xml', 'rtf'
    ],
    extract_entities: true,
    extract_relationships: true,
    ocr_enabled: false,
  };

  constructor() {
    super();
    this.startWorkers();
  }

  async startFileIngestion(request: FileIngestionRequest): Promise<string> {
    const jobId = uuidv4();
    
    const job: IngestionJob = {
      id: jobId,
      type: 'file',
      status: 'pending',
      userId: request.userId,
      createdAt: new Date(),
      progress: {
        total: 1,
        processed: 0,
        succeeded: 0,
        failed: 0,
      },
      options: request.options,
      results: {
        documents: [],
        entities: [],
        errors: [],
      },
    };

    this.jobs.set(jobId, job);
    this.processingQueue.push(job);
    
    this.emit('jobCreated', job);
    this.processQueue();
    
    return jobId;
  }

  async startDirectoryIngestion(request: DirectoryIngestionRequest): Promise<string> {
    const jobId = uuidv4();
    
    // Get file count for progress tracking
    const fileCount = await this.getDirectoryFileCount(
      request.directoryPath, 
      request.options.recursive
    );
    
    const job: IngestionJob = {
      id: jobId,
      type: 'directory',
      status: 'pending',
      userId: request.userId,
      createdAt: new Date(),
      progress: {
        total: fileCount,
        processed: 0,
        succeeded: 0,
        failed: 0,
      },
      options: {
        extractEntities: request.options.extractEntities,
        buildRelationships: request.options.buildRelationships,
      },
      results: {
        documents: [],
        entities: [],
        errors: [],
      },
    };

    this.jobs.set(jobId, job);
    this.processingQueue.push(job);
    
    this.emit('jobCreated', job);
    this.processQueue();
    
    return jobId;
  }

  async startBatchIngestion(request: BatchIngestionRequest): Promise<string> {
    const jobId = uuidv4();
    
    const job: IngestionJob = {
      id: jobId,
      type: 'batch',
      status: 'pending',
      userId: request.userId,
      createdAt: new Date(),
      progress: {
        total: request.files.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
      },
      options: request.options,
      results: {
        documents: [],
        entities: [],
        errors: [],
      },
    };

    this.jobs.set(jobId, job);
    this.processingQueue.push(job);
    
    this.emit('jobCreated', job);
    this.processQueue();
    
    return jobId;
  }

  async getJobStatus(jobId: string): Promise<IngestionJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async listJobs(options: {
    userId: string;
    status?: string;
    limit: number;
    offset: number;
  }): Promise<IngestionJob[]> {
    const allJobs = Array.from(this.jobs.values())
      .filter(job => job.userId === options.userId)
      .filter(job => !options.status || job.status === options.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(options.offset, options.offset + options.limit);

    return allJobs;
  }

  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    
    if (!job || job.userId !== userId) {
      return false;
    }
    
    if (job.status === 'pending') {
      job.status = 'cancelled';
      job.completedAt = new Date();
      
      // Remove from processing queue
      const queueIndex = this.processingQueue.findIndex(j => j.id === jobId);
      if (queueIndex !== -1) {
        this.processingQueue.splice(queueIndex, 1);
      }
      
      this.emit('jobCancelled', job);
      return true;
    }
    
    if (job.status === 'running') {
      job.status = 'cancelled';
      job.completedAt = new Date();
      this.emit('jobCancelled', job);
      return true;
    }
    
    return false;
  }

  async getIngestionStats(options: {
    userId: string;
    timeRange: string;
  }): Promise<any> {
    const now = new Date();
    let startDate: Date;
    
    switch (options.timeRange) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const userJobs = Array.from(this.jobs.values())
      .filter(job => job.userId === options.userId)
      .filter(job => job.createdAt >= startDate);

    const stats = {
      total_jobs: userJobs.length,
      completed_jobs: userJobs.filter(j => j.status === 'completed').length,
      failed_jobs: userJobs.filter(j => j.status === 'failed').length,
      cancelled_jobs: userJobs.filter(j => j.status === 'cancelled').length,
      total_documents: userJobs.reduce((sum, job) => sum + job.results.documents.length, 0),
      total_entities: userJobs.reduce((sum, job) => sum + job.results.entities.length, 0),
      processing_time: {
        avg: this.calculateAverageProcessingTime(userJobs),
        total: this.calculateTotalProcessingTime(userJobs),
      },
      file_types: this.getFileTypeDistribution(userJobs),
      errors: userJobs.reduce((sum, job) => sum + job.results.errors.length, 0),
    };

    return stats;
  }

  async getSupportedFileTypes(): Promise<string[]> {
    return this.config.supported_extensions;
  }

  async getMaxFileSize(): Promise<number> {
    return this.config.max_file_size;
  }

  async updateConfig(newConfig: Partial<IngestionConfig>): Promise<IngestionConfig> {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
    return this.config;
  }

  async getConfig(): Promise<IngestionConfig> {
    return { ...this.config };
  }

  async reprocessDocument(options: {
    documentId: string;
    options: any;
    userId: string;
  }): Promise<string> {
    // TODO: Implement document reprocessing
    // This would involve:
    // 1. Getting the original document from database
    // 2. Creating a new ingestion job for that document
    // 3. Updating the existing document record
    
    const jobId = uuidv4();
    // Placeholder implementation
    return jobId;
  }

  async getQueueStatus(): Promise<{
    paused: boolean;
    pending: number;
    running: number;
    workers: { active: number; max: number };
  }> {
    return {
      paused: this.queuePaused,
      pending: this.processingQueue.length,
      running: this.activeWorkers,
      workers: {
        active: this.activeWorkers,
        max: this.maxWorkers,
      },
    };
  }

  async toggleQueue(action: 'pause' | 'resume'): Promise<boolean> {
    this.queuePaused = action === 'pause';
    
    if (action === 'resume') {
      this.processQueue();
    }
    
    this.emit('queueToggled', { action, paused: this.queuePaused });
    return true;
  }

  async previewFile(filePath: string, maxLines: number): Promise<{
    content: string;
    file_size: number;
    file_type: string;
    encoding: string;
    line_count: number;
    estimated_processing_time: number;
  }> {
    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      const preview = lines.slice(0, maxLines).join('\n');
      
      return {
        content: preview,
        file_size: stats.size,
        file_type: path.extname(filePath).slice(1).toLowerCase(),
        encoding: 'utf8',
        line_count: lines.length,
        estimated_processing_time: await this.estimateProcessingTime(filePath),
      };
    } catch (error) {
      throw new Error(`Failed to preview file: ${error.message}`);
    }
  }

  async getDirectoryFileCount(dirPath: string, recursive: boolean): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let count = 0;
      
      for (const entry of entries) {
        if (entry.isFile() && this.isSupportedFile(entry.name)) {
          count++;
        } else if (entry.isDirectory() && recursive) {
          const subPath = path.join(dirPath, entry.name);
          count += await this.getDirectoryFileCount(subPath, recursive);
        }
      }
      
      return count;
    } catch (error) {
      return 0;
    }
  }

  async estimateProcessingTime(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      const extension = path.extname(filePath).slice(1).toLowerCase();
      
      // Base processing time based on file size (1MB per second)
      let baseTime = fileSize / (1024 * 1024);
      
      // Adjust based on file type complexity
      const complexityMultipliers: Record<string, number> = {
        'pdf': 3,
        'docx': 2.5,
        'html': 2,
        'xml': 2,
        'csv': 1.5,
        'json': 1.2,
        'txt': 1,
        'md': 1,
      };
      
      const multiplier = complexityMultipliers[extension] || 2;
      return Math.ceil(baseTime * multiplier);
    } catch (error) {
      return 5; // Default estimate
    }
  }

  private startWorkers(): void {
    setInterval(() => {
      this.processQueue();
    }, 1000); // Check queue every second
  }

  private async processQueue(): Promise<void> {
    if (this.queuePaused || this.activeWorkers >= this.maxWorkers) {
      return;
    }

    const job = this.processingQueue.shift();
    if (!job) {
      return;
    }

    this.activeWorkers++;
    job.status = 'running';
    job.startedAt = new Date();
    
    this.emit('jobStarted', job);

    try {
      await this.processJob(job);
      job.status = 'completed';
      job.completedAt = new Date();
      this.emit('jobCompleted', job);
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date();
      this.emit('jobFailed', job);
    } finally {
      this.activeWorkers--;
      // Process next job
      setImmediate(() => this.processQueue());
    }
  }

  private async processJob(job: IngestionJob): Promise<void> {
    // TODO: Implement actual job processing using Rust core libraries
    // This would involve:
    // 1. Loading files using the appropriate document processors
    // 2. Extracting entities if enabled
    // 3. Building relationships if enabled
    // 4. Storing documents and entities in database
    // 5. Updating job progress
    
    // Simulate processing for now
    await new Promise(resolve => setTimeout(resolve, 1000));
    job.progress.processed = job.progress.total;
    job.progress.succeeded = job.progress.total;
  }

  private isSupportedFile(fileName: string): boolean {
    const extension = path.extname(fileName).slice(1).toLowerCase();
    return this.config.supported_extensions.includes(extension);
  }

  private calculateAverageProcessingTime(jobs: IngestionJob[]): number {
    const completedJobs = jobs.filter(j => j.status === 'completed' && j.startedAt && j.completedAt);
    
    if (completedJobs.length === 0) return 0;
    
    const totalTime = completedJobs.reduce((sum, job) => {
      const processingTime = job.completedAt!.getTime() - job.startedAt!.getTime();
      return sum + processingTime;
    }, 0);
    
    return totalTime / completedJobs.length / 1000; // Convert to seconds
  }

  private calculateTotalProcessingTime(jobs: IngestionJob[]): number {
    const completedJobs = jobs.filter(j => j.status === 'completed' && j.startedAt && j.completedAt);
    
    return completedJobs.reduce((sum, job) => {
      const processingTime = job.completedAt!.getTime() - job.startedAt!.getTime();
      return sum + processingTime;
    }, 0) / 1000; // Convert to seconds
  }

  private getFileTypeDistribution(jobs: IngestionJob[]): Record<string, number> {
    // TODO: Implement file type distribution calculation
    return {};
  }
}