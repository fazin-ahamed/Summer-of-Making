import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { DocumentIngestionService } from '../services/ingestion';
import { FileUploadService } from '../services/upload';
import { validateFileType, validateFileSize } from '../utils/validation';
import type { 
  DocumentInfo, 
  IngestionConfig,
  ProcessedDocument,
  FileEvent 
} from '@autoorganize/types';

const ingestionService = new DocumentIngestionService();
const uploadService = new FileUploadService();

// Input validation schemas
const ingestFileSchema = z.object({
  file_path: z.string().min(1, 'File path is required'),
  source_type: z.enum(['file_system', 'email', 'cloud_storage', 'development_tools', 'communication', 'browser']),
  extract_entities: z.boolean().default(true),
  build_relationships: z.boolean().default(true),
  auto_encrypt: z.boolean().default(false),
});

const ingestDirectorySchema = z.object({
  directory_path: z.string().min(1, 'Directory path is required'),
  source_type: z.enum(['file_system', 'cloud_storage']),
  recursive: z.boolean().default(true),
  file_patterns: z.array(z.string()).optional(),
  exclude_patterns: z.array(z.string()).optional(),
  extract_entities: z.boolean().default(true),
  build_relationships: z.boolean().default(true),
});

const batchIngestSchema = z.object({
  files: z.array(z.object({
    file_path: z.string(),
    source_type: z.string(),
    metadata: z.record(z.any()).optional(),
  })).min(1, 'At least one file is required').max(50, 'Maximum 50 files per batch'),
  options: z.object({
    extract_entities: z.boolean().default(true),
    build_relationships: z.boolean().default(true),
    continue_on_error: z.boolean().default(true),
  }),
});

const updateConfigSchema = z.object({
  max_file_size: z.number().positive().optional(),
  chunk_size: z.number().positive().optional(),
  chunk_overlap: z.number().min(0).optional(),
  supported_extensions: z.array(z.string()).optional(),
  extract_entities: z.boolean().optional(),
  extract_relationships: z.boolean().optional(),
  ocr_enabled: z.boolean().optional(),
});

export const ingestionRouter = router({
  // Ingest a single file
  ingestFile: protectedProcedure
    .input(ingestFileSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Validate file exists and is accessible
        await validateFileType(input.file_path);
        await validateFileSize(input.file_path);

        // Start ingestion process
        const jobId = await ingestionService.startFileIngestion({
          filePath: input.file_path,
          sourceType: input.source_type,
          options: {
            extractEntities: input.extract_entities,
            buildRelationships: input.build_relationships,
            autoEncrypt: input.auto_encrypt,
          },
          userId: ctx.user.id,
        });

        return {
          success: true,
          job_id: jobId,
          message: 'File ingestion started successfully',
          estimated_duration: await ingestionService.estimateProcessingTime(input.file_path),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Failed to start file ingestion: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Ingest a directory
  ingestDirectory: protectedProcedure
    .input(ingestDirectorySchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const jobId = await ingestionService.startDirectoryIngestion({
          directoryPath: input.directory_path,
          sourceType: input.source_type,
          options: {
            recursive: input.recursive,
            filePatterns: input.file_patterns || ['**/*'],
            excludePatterns: input.exclude_patterns || ['node_modules/**', '.git/**'],
            extractEntities: input.extract_entities,
            buildRelationships: input.build_relationships,
          },
          userId: ctx.user.id,
        });

        const fileCount = await ingestionService.getDirectoryFileCount(
          input.directory_path, 
          input.recursive
        );

        return {
          success: true,
          job_id: jobId,
          message: 'Directory ingestion started successfully',
          estimated_file_count: fileCount,
          estimated_duration: fileCount * 2, // Estimate 2 seconds per file
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Failed to start directory ingestion: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Batch ingest multiple files
  batchIngest: protectedProcedure
    .input(batchIngestSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const jobId = await ingestionService.startBatchIngestion({
          files: input.files,
          options: input.options,
          userId: ctx.user.id,
        });

        return {
          success: true,
          job_id: jobId,
          message: 'Batch ingestion started successfully',
          file_count: input.files.length,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Failed to start batch ingestion: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Get ingestion job status
  getJobStatus: publicProcedure
    .input(z.object({ job_id: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const status = await ingestionService.getJobStatus(input.job_id);
        
        if (!status) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ingestion job not found',
          });
        }

        return status;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get job status: ${error.message}`,
          cause: error,
        });
      }
    }),

  // List active ingestion jobs
  listJobs: protectedProcedure
    .input(z.object({
      status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const jobs = await ingestionService.listJobs({
          userId: ctx.user.id,
          status: input.status,
          limit: input.limit,
          offset: input.offset,
        });

        return {
          jobs,
          total: jobs.length,
          hasMore: jobs.length === input.limit,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list ingestion jobs: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Cancel an ingestion job
  cancelJob: protectedProcedure
    .input(z.object({ job_id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const success = await ingestionService.cancelJob(input.job_id, ctx.user.id);
        
        if (!success) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Job not found or cannot be cancelled',
          });
        }

        return {
          success: true,
          message: 'Job cancelled successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to cancel job: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Get ingestion statistics
  getStats: protectedProcedure
    .input(z.object({
      time_range: z.enum(['day', 'week', 'month', 'year']).default('week'),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const stats = await ingestionService.getIngestionStats({
          userId: ctx.user.id,
          timeRange: input.time_range,
        });

        return stats;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get ingestion statistics: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Get supported file types
  getSupportedTypes: publicProcedure
    .query(async () => {
      try {
        const supportedTypes = await ingestionService.getSupportedFileTypes();
        return {
          file_types: supportedTypes,
          max_file_size: await ingestionService.getMaxFileSize(),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get supported file types: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Update ingestion configuration
  updateConfig: protectedProcedure
    .input(updateConfigSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Check if user has admin privileges
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only administrators can update ingestion configuration',
          });
        }

        const updatedConfig = await ingestionService.updateConfig(input);
        
        return {
          success: true,
          config: updatedConfig,
          message: 'Configuration updated successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update configuration: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Get current ingestion configuration
  getConfig: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const config = await ingestionService.getConfig();
        return config;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get configuration: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Re-process a document
  reprocessDocument: protectedProcedure
    .input(z.object({
      document_id: z.string(),
      options: z.object({
        extract_entities: z.boolean().default(true),
        build_relationships: z.boolean().default(true),
        force_reprocess: z.boolean().default(false),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const jobId = await ingestionService.reprocessDocument({
          documentId: input.document_id,
          options: input.options,
          userId: ctx.user.id,
        });

        return {
          success: true,
          job_id: jobId,
          message: 'Document reprocessing started',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Failed to start document reprocessing: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Get ingestion queue status
  getQueueStatus: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const queueStatus = await ingestionService.getQueueStatus();
        return queueStatus;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get queue status: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Pause/resume ingestion queue
  toggleQueue: protectedProcedure
    .input(z.object({
      action: z.enum(['pause', 'resume']),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Check admin privileges
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only administrators can control the ingestion queue',
          });
        }

        const success = await ingestionService.toggleQueue(input.action);
        
        return {
          success,
          message: `Queue ${input.action}d successfully`,
          status: await ingestionService.getQueueStatus(),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to ${input.action} queue: ${error.message}`,
          cause: error,
        });
      }
    }),

  // Get file preview for ingestion
  previewFile: publicProcedure
    .input(z.object({
      file_path: z.string(),
      max_lines: z.number().min(1).max(100).default(10),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const preview = await ingestionService.previewFile(
          input.file_path, 
          input.max_lines
        );

        return preview;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Failed to preview file: ${error.message}`,
          cause: error,
        });
      }
    }),
});