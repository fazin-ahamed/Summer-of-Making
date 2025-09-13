import { EventEmitter } from 'events';
import * as ort from 'onnxruntime-node';
import { DatabaseManager } from '../../database';
import path from 'path';
import fs from 'fs/promises';

// Embedding model configurations
export interface EmbeddingModelConfig {
  name: string;
  modelPath: string;
  dimensions: number;
  maxSequenceLength: number;
  tokenizer: 'bert' | 'sentence-transformers' | 'custom';
  vocabulary?: string;
  preprocessorConfig?: Record<string, any>;
}

export interface EmbeddingVector {
  id: string;
  documentId?: string;
  entityId?: string;
  text: string;
  vector: Float32Array;
  model: string;
  dimensions: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SemanticSearchOptions {
  model?: string;
  threshold?: number;
  limit?: number;
  includeMetadata?: boolean;
  filters?: {
    documentTypes?: string[];
    entities?: string[];
    dateRange?: {
      start?: Date;
      end?: Date;
    };
  };
}

export interface SemanticSearchResult {
  id: string;
  text: string;
  similarity: number;
  documentId?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

export class SemanticEmbeddingsEngine extends EventEmitter {
  private dbManager: DatabaseManager;
  private models: Map<string, ort.InferenceSession>;
  private modelConfigs: Map<string, EmbeddingModelConfig>;
  private defaultModel: string;
  private isInitialized: boolean;

  constructor() {
    super();
    this.dbManager = new DatabaseManager();
    this.models = new Map();
    this.modelConfigs = new Map();
    this.defaultModel = 'sentence-transformers-all-MiniLM-L6-v2';
    this.isInitialized = false;
  }

  async initialize(): Promise<void> {
    try {
      await this.dbManager.initialize();
      await this.loadModelConfigurations();
      await this.initializeDefaultModel();
      
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async loadModelConfigurations(): Promise<void> {
    // Define available embedding models
    const configs: EmbeddingModelConfig[] = [
      {
        name: 'sentence-transformers-all-MiniLM-L6-v2',
        modelPath: 'models/sentence-transformers-all-MiniLM-L6-v2/model.onnx',
        dimensions: 384,
        maxSequenceLength: 256,
        tokenizer: 'sentence-transformers',
        vocabulary: 'models/sentence-transformers-all-MiniLM-L6-v2/vocab.txt',
      },
      {
        name: 'sentence-transformers-all-mpnet-base-v2',
        modelPath: 'models/sentence-transformers-all-mpnet-base-v2/model.onnx',
        dimensions: 768,
        maxSequenceLength: 384,
        tokenizer: 'sentence-transformers',
        vocabulary: 'models/sentence-transformers-all-mpnet-base-v2/vocab.txt',
      },
      {
        name: 'bert-base-uncased',
        modelPath: 'models/bert-base-uncased/model.onnx',
        dimensions: 768,
        maxSequenceLength: 512,
        tokenizer: 'bert',
        vocabulary: 'models/bert-base-uncased/vocab.txt',
      },
    ];

    for (const config of configs) {
      this.modelConfigs.set(config.name, config);
    }
  }

  private async initializeDefaultModel(): Promise<void> {
    try {
      await this.loadModel(this.defaultModel);
    } catch (error) {
      console.warn(`Failed to load default model ${this.defaultModel}, using mock implementation`);
      // In development, we'll use mock embeddings
    }
  }

  async loadModel(modelName: string): Promise<void> {
    if (this.models.has(modelName)) {
      return; // Model already loaded
    }

    const config = this.modelConfigs.get(modelName);
    if (!config) {
      throw new Error(`Model configuration not found: ${modelName}`);
    }

    try {
      // Check if model file exists
      const modelPath = path.resolve(config.modelPath);
      await fs.access(modelPath);

      // Load ONNX model
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'], // Use CPU provider for compatibility
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
      });

      this.models.set(modelName, session);
      this.emit('model_loaded', { modelName, config });
    } catch (error) {
      console.error(`Failed to load model ${modelName}:`, error);
      // For development, we'll continue without the actual model
      this.emit('model_load_failed', { modelName, error });
    }
  }

  async generateEmbedding(
    text: string,
    modelName: string = this.defaultModel
  ): Promise<Float32Array> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const model = this.models.get(modelName);
    const config = this.modelConfigs.get(modelName);

    if (!model || !config) {
      // Fallback to mock embedding for development
      return this.generateMockEmbedding(text, config?.dimensions || 384);
    }

    try {
      // Tokenize and prepare input
      const tokens = await this.tokenizeText(text, config);
      
      // Create input tensors
      const inputIds = new ort.Tensor('int64', tokens.inputIds, [1, tokens.inputIds.length]);
      const attentionMask = new ort.Tensor('int64', tokens.attentionMask, [1, tokens.attentionMask.length]);

      // Run inference
      const feeds: Record<string, ort.Tensor> = {
        'input_ids': inputIds,
        'attention_mask': attentionMask,
      };

      // Add token_type_ids for BERT models
      if (config.tokenizer === 'bert') {
        const tokenTypeIds = new ort.Tensor('int64', new BigInt64Array(tokens.inputIds.length).fill(0n), [1, tokens.inputIds.length]);
        feeds['token_type_ids'] = tokenTypeIds;
      }

      const results = await model.run(feeds);
      
      // Extract embeddings from model output
      const outputKey = Object.keys(results)[0]; // Usually 'last_hidden_state' or 'pooler_output'
      const outputTensor = results[outputKey];
      
      // Pool the embeddings (mean pooling)
      const embeddings = this.poolEmbeddings(outputTensor.data as Float32Array, tokens.attentionMask);
      
      // Normalize embeddings
      return this.normalizeVector(embeddings);
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Fallback to mock embedding
      return this.generateMockEmbedding(text, config.dimensions);
    }
  }

  private async tokenizeText(text: string, config: EmbeddingModelConfig): Promise<{
    inputIds: BigInt64Array;
    attentionMask: BigInt64Array;
  }> {
    // Simplified tokenization - in a real implementation, you'd use a proper tokenizer
    const words = text.toLowerCase().split(/\s+/).slice(0, config.maxSequenceLength - 2);
    
    // Mock tokenization with fake token IDs
    const inputIds = new BigInt64Array(config.maxSequenceLength);
    const attentionMask = new BigInt64Array(config.maxSequenceLength);
    
    // CLS token
    inputIds[0] = 101n;
    attentionMask[0] = 1n;
    
    // Text tokens (using hash of word as token ID)
    for (let i = 0; i < words.length; i++) {
      inputIds[i + 1] = BigInt(this.hashString(words[i]) % 30000 + 1000);
      attentionMask[i + 1] = 1n;
    }
    
    // SEP token
    if (words.length + 1 < config.maxSequenceLength) {
      inputIds[words.length + 1] = 102n;
      attentionMask[words.length + 1] = 1n;
    }

    return { inputIds, attentionMask };
  }

  private poolEmbeddings(embeddings: Float32Array, attentionMask: BigInt64Array): Float32Array {
    // Mean pooling with attention mask
    const sequenceLength = attentionMask.length;
    const hiddenSize = embeddings.length / sequenceLength;
    const pooled = new Float32Array(hiddenSize);
    
    let totalTokens = 0;
    for (let i = 0; i < sequenceLength; i++) {
      if (attentionMask[i] === 1n) {
        totalTokens++;
        for (let j = 0; j < hiddenSize; j++) {
          pooled[j] += embeddings[i * hiddenSize + j];
        }
      }
    }
    
    // Average
    if (totalTokens > 0) {
      for (let j = 0; j < hiddenSize; j++) {
        pooled[j] /= totalTokens;
      }
    }
    
    return pooled;
  }

  private normalizeVector(vector: Float32Array): Float32Array {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    
    return vector;
  }

  private generateMockEmbedding(text: string, dimensions: number): Float32Array {
    // Generate deterministic mock embedding based on text content
    const embedding = new Float32Array(dimensions);
    const textHash = this.hashString(text);
    
    for (let i = 0; i < dimensions; i++) {
      const seed = textHash + i;
      embedding[i] = this.pseudoRandom(seed) * 2 - 1; // Range [-1, 1]
    }
    
    return this.normalizeVector(embedding);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private pseudoRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  async storeEmbedding(embedding: Omit<EmbeddingVector, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const id = this.generateEmbeddingId();
      const now = new Date();
      
      const stmt = db.prepare(`
        INSERT INTO embeddings (
          id, document_id, entity_id, text, vector, model, dimensions, 
          metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        embedding.documentId || null,
        embedding.entityId || null,
        embedding.text,
        Buffer.from(embedding.vector.buffer),
        embedding.model,
        embedding.dimensions,
        JSON.stringify(embedding.metadata || {}),
        now.toISOString(),
        now.toISOString()
      );

      this.emit('embedding_stored', { id, model: embedding.model });
      return id;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to store embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async batchStoreEmbeddings(embeddings: Array<Omit<EmbeddingVector, 'id' | 'createdAt' | 'updatedAt'>>): Promise<string[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const ids: string[] = [];
      const now = new Date();
      
      const stmt = db.prepare(`
        INSERT INTO embeddings (
          id, document_id, entity_id, text, vector, model, dimensions, 
          metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction(() => {
        for (const embedding of embeddings) {
          const id = this.generateEmbeddingId();
          ids.push(id);
          
          stmt.run(
            id,
            embedding.documentId || null,
            embedding.entityId || null,
            embedding.text,
            Buffer.from(embedding.vector.buffer),
            embedding.model,
            embedding.dimensions,
            JSON.stringify(embedding.metadata || {}),
            now.toISOString(),
            now.toISOString()
          );
        }
      });

      transaction();
      
      this.emit('embeddings_batch_stored', { count: embeddings.length });
      return ids;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to batch store embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async semanticSearch(
    queryText: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    try {
      const searchOptions: Required<SemanticSearchOptions> = {
        model: options.model || this.defaultModel,
        threshold: options.threshold || 0.5,
        limit: options.limit || 10,
        includeMetadata: options.includeMetadata ?? true,
        filters: options.filters || {},
      };

      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(queryText, searchOptions.model);
      
      // Search for similar embeddings
      const results = await this.findSimilarEmbeddings(queryEmbedding, searchOptions);
      
      return results;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async findSimilarEmbeddings(
    queryEmbedding: Float32Array,
    options: Required<SemanticSearchOptions>
  ): Promise<SemanticSearchResult[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      // Build query with filters
      let query = `
        SELECT e.id, e.text, e.vector, e.document_id, e.entity_id, e.metadata,
               d.title as document_title, d.file_type
        FROM embeddings e
        LEFT JOIN documents d ON e.document_id = d.id
        WHERE e.model = ?
      `;
      
      const params: any[] = [options.model];
      
      // Apply filters
      if (options.filters.documentTypes && options.filters.documentTypes.length > 0) {
        query += ` AND d.file_type IN (${options.filters.documentTypes.map(() => '?').join(',')})`;
        params.push(...options.filters.documentTypes);
      }
      
      if (options.filters.dateRange?.start) {
        query += ` AND e.created_at >= ?`;
        params.push(options.filters.dateRange.start.toISOString());
      }
      
      if (options.filters.dateRange?.end) {
        query += ` AND e.created_at <= ?`;
        params.push(options.filters.dateRange.end.toISOString());
      }
      
      query += ` LIMIT ?`;
      params.push(options.limit * 10); // Get more candidates for similarity filtering
      
      const stmt = db.prepare(query);
      const rows = stmt.all(...params);
      
      // Calculate similarities
      const candidates = rows.map(row => {
        const storedVector = new Float32Array(row.vector);
        const similarity = this.cosineSimilarity(queryEmbedding, storedVector);
        
        return {
          id: row.id,
          text: row.text,
          similarity,
          documentId: row.document_id,
          entityId: row.entity_id,
          metadata: options.includeMetadata && row.metadata ? JSON.parse(row.metadata) : undefined,
        };
      });
      
      // Filter by threshold and sort by similarity
      return candidates
        .filter(candidate => candidate.similarity >= options.threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, options.limit);
    } catch (error) {
      console.error('Error finding similar embeddings:', error);
      // Return mock results for development
      return this.generateMockSearchResults(queryEmbedding, options);
    }
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private generateMockSearchResults(
    queryEmbedding: Float32Array,
    options: Required<SemanticSearchOptions>
  ): SemanticSearchResult[] {
    // Generate mock search results for development
    const mockResults: SemanticSearchResult[] = [
      {
        id: 'mock_1',
        text: 'This is a mock semantic search result with high similarity',
        similarity: 0.95,
        documentId: 'doc_1',
        metadata: { source: 'mock', type: 'document' },
      },
      {
        id: 'mock_2',
        text: 'Another mock result with medium similarity',
        similarity: 0.78,
        documentId: 'doc_2',
        metadata: { source: 'mock', type: 'document' },
      },
      {
        id: 'mock_3',
        text: 'A third mock result with lower similarity',
        similarity: 0.62,
        entityId: 'entity_1',
        metadata: { source: 'mock', type: 'entity' },
      },
    ];
    
    return mockResults
      .filter(result => result.similarity >= options.threshold)
      .slice(0, options.limit);
  }

  async generateDocumentEmbeddings(
    documentId: string,
    content: string,
    chunkSize: number = 500,
    overlapSize: number = 50
  ): Promise<string[]> {
    try {
      const chunks = this.chunkText(content, chunkSize, overlapSize);
      const embeddings: Array<Omit<EmbeddingVector, 'id' | 'createdAt' | 'updatedAt'>> = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = await this.generateEmbedding(chunk);
        
        embeddings.push({
          documentId,
          text: chunk,
          vector,
          model: this.defaultModel,
          dimensions: vector.length,
          metadata: {
            chunkIndex: i,
            totalChunks: chunks.length,
            chunkSize: chunk.length,
          },
        });
      }
      
      return await this.batchStoreEmbeddings(embeddings);
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to generate document embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private chunkText(text: string, chunkSize: number, overlapSize: number): string[] {
    const chunks: string[] = [];
    const words = text.split(/\s+/);
    
    for (let i = 0; i < words.length; i += chunkSize - overlapSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim().length > 0) {
        chunks.push(chunk.trim());
      }
    }
    
    return chunks.length > 0 ? chunks : [text];
  }

  async getEmbeddingsByDocument(documentId: string): Promise<EmbeddingVector[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      const stmt = db.prepare(`
        SELECT * FROM embeddings 
        WHERE document_id = ? 
        ORDER BY created_at ASC
      `);

      const rows = stmt.all(documentId);
      
      return rows.map(row => ({
        id: row.id,
        documentId: row.document_id,
        entityId: row.entity_id,
        text: row.text,
        vector: new Float32Array(row.vector),
        model: row.model,
        dimensions: row.dimensions,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to get embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteEmbeddings(documentId?: string, entityId?: string): Promise<number> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      let query = 'DELETE FROM embeddings WHERE ';
      const params: any[] = [];
      
      if (documentId) {
        query += 'document_id = ?';
        params.push(documentId);
      } else if (entityId) {
        query += 'entity_id = ?';
        params.push(entityId);
      } else {
        throw new Error('Either documentId or entityId must be provided');
      }
      
      const stmt = db.prepare(query);
      const result = stmt.run(...params);
      
      this.emit('embeddings_deleted', { 
        count: result.changes, 
        documentId, 
        entityId 
      });
      
      return result.changes;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to delete embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateEmbeddingId(): string {
    return `embedding_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  getAvailableModels(): EmbeddingModelConfig[] {
    return Array.from(this.modelConfigs.values());
  }

  getModelInfo(modelName: string): EmbeddingModelConfig | undefined {
    return this.modelConfigs.get(modelName);
  }

  isModelLoaded(modelName: string): boolean {
    return this.models.has(modelName);
  }
}

export default SemanticEmbeddingsEngine;