import { EventEmitter } from 'events';
import { DatabaseManager } from '../../database';

// Entity types supported by the system
export enum EntityType {
  PERSON = 'PERSON',
  ORGANIZATION = 'ORGANIZATION',
  LOCATION = 'LOCATION',
  DATE = 'DATE',
  TIME = 'TIME',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  URL = 'URL',
  MONEY = 'MONEY',
  PERCENT = 'PERCENT',
  NUMBER = 'NUMBER',
  MISC = 'MISC',
  PRODUCT = 'PRODUCT',
  EVENT = 'EVENT',
  WORK_OF_ART = 'WORK_OF_ART',
  LAW = 'LAW',
  LANGUAGE = 'LANGUAGE',
  NATIONALITY = 'NATIONALITY',
  RELIGION = 'RELIGION',
  TITLE = 'TITLE',
  SKILL = 'SKILL',
  CONCEPT = 'CONCEPT',
}

export interface Entity {
  id: string;
  text: string;
  type: EntityType;
  startPos: number;
  endPos: number;
  confidence: number;
  context?: string;
  normalizedValue?: string;
  metadata?: Record<string, any>;
  documentId?: string;
  mentions?: number;
  aliases?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EntityExtractionOptions {
  enabledTypes?: EntityType[];
  minConfidence?: number;
  contextWindow?: number;
  mergeOverlapping?: boolean;
  extractConcepts?: boolean;
  language?: string;
}

export interface EntityExtractionResult {
  entities: Entity[];
  confidence: number;
  processingTime: number;
  tokensProcessed: number;
  language: string;
}

export class EntityExtractionEngine extends EventEmitter {
  private dbManager: DatabaseManager;
  private patterns: Map<EntityType, RegExp[]>;
  private stopWords: Set<string>;
  private conceptKeywords: Map<string, EntityType>;

  constructor() {
    super();
    this.dbManager = new DatabaseManager();
    this.patterns = new Map();
    this.stopWords = new Set();
    this.conceptKeywords = new Map();
    this.initializePatterns();
    this.initializeStopWords();
    this.initializeConceptKeywords();
  }

  async initialize(): Promise<void> {
    try {
      await this.dbManager.initialize();
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async extractEntities(
    text: string,
    options: EntityExtractionOptions = {}
  ): Promise<EntityExtractionResult> {
    const startTime = Date.now();
    
    const extractionOptions: Required<EntityExtractionOptions> = {
      enabledTypes: options.enabledTypes || Object.values(EntityType),
      minConfidence: options.minConfidence || 0.5,
      contextWindow: options.contextWindow || 50,
      mergeOverlapping: options.mergeOverlapping ?? true,
      extractConcepts: options.extractConcepts ?? true,
      language: options.language || 'en',
    };

    try {
      // Tokenize and preprocess text
      const tokens = this.tokenizeText(text);
      
      // Extract different types of entities
      let entities: Entity[] = [];

      // Rule-based extraction
      entities.push(...await this.extractByPatterns(text, extractionOptions));
      
      // Statistical extraction
      entities.push(...await this.extractByStatistics(text, tokens, extractionOptions));
      
      // Concept extraction
      if (extractionOptions.extractConcepts) {
        entities.push(...await this.extractConcepts(text, tokens, extractionOptions));
      }

      // Context extraction
      entities = this.addContext(text, entities, extractionOptions.contextWindow);

      // Post-processing
      entities = this.filterByConfidence(entities, extractionOptions.minConfidence);
      
      if (extractionOptions.mergeOverlapping) {
        entities = this.mergeOverlappingEntities(entities);
      }

      entities = this.normalizeEntities(entities);
      entities = await this.enhanceWithKnowledgeBase(entities);

      const processingTime = Date.now() - startTime;
      
      // Calculate overall confidence
      const avgConfidence = entities.length > 0 
        ? entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length 
        : 0;

      return {
        entities: entities.sort((a, b) => a.startPos - b.startPos), // Sort by position
        confidence: avgConfidence,
        processingTime,
        tokensProcessed: tokens.length,
        language: extractionOptions.language,
      };
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Entity extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private initializePatterns(): void {
    // Email patterns
    this.patterns.set(EntityType.EMAIL, [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ]);

    // Phone patterns
    this.patterns.set(EntityType.PHONE, [
      /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
      /(?:\+?1[-.\s]?)?([0-9]{3})[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    ]);

    // URL patterns
    this.patterns.set(EntityType.URL, [
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
      /www\.[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
    ]);

    // Date patterns
    this.patterns.set(EntityType.DATE, [
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b\d{1,2}-\d{1,2}-\d{4}\b/g,
    ]);

    // Time patterns
    this.patterns.set(EntityType.TIME, [
      /\b(?:1[0-2]|0?[1-9]):[0-5][0-9]\s?(?:AM|PM|am|pm)\b/g,
      /\b(?:2[0-3]|[01]?[0-9]):[0-5][0-9](?::[0-5][0-9])?\b/g,
    ]);

    // Money patterns
    this.patterns.set(EntityType.MONEY, [
      /\$\s?[\d,]+(?:\.\d{2})?\b/g,
      /\b\d+(?:\.\d{2})?\s?(?:USD|EUR|GBP|CAD|AUD)\b/g,
    ]);

    // Percentage patterns
    this.patterns.set(EntityType.PERCENT, [
      /\b\d+(?:\.\d+)?%\b/g,
      /\b\d+(?:\.\d+)?\s?percent\b/g,
    ]);

    // Number patterns
    this.patterns.set(EntityType.NUMBER, [
      /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g,
    ]);
  }

  private initializeStopWords(): void {
    const stopWordsList = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
    ];
    this.stopWords = new Set(stopWordsList);
  }

  private initializeConceptKeywords(): void {
    // Technology concepts
    const techKeywords = [
      'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
      'blockchain', 'cryptocurrency', 'cloud computing', 'big data', 'internet of things',
      'virtual reality', 'augmented reality', 'cybersecurity', 'software engineering',
      'data science', 'natural language processing', 'computer vision', 'robotics'
    ];
    
    techKeywords.forEach(keyword => {
      this.conceptKeywords.set(keyword.toLowerCase(), EntityType.CONCEPT);
    });

    // Business concepts
    const businessKeywords = [
      'marketing', 'sales', 'finance', 'accounting', 'human resources', 'operations',
      'strategy', 'management', 'leadership', 'entrepreneurship', 'innovation',
      'supply chain', 'customer service', 'quality assurance', 'project management'
    ];
    
    businessKeywords.forEach(keyword => {
      this.conceptKeywords.set(keyword.toLowerCase(), EntityType.CONCEPT);
    });
  }

  private tokenizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0 && !this.stopWords.has(token));
  }

  private async extractByPatterns(
    text: string,
    options: Required<EntityExtractionOptions>
  ): Promise<Entity[]> {
    const entities: Entity[] = [];

    for (const [entityType, patterns] of this.patterns) {
      if (!options.enabledTypes.includes(entityType)) continue;

      for (const pattern of patterns) {
        let match;
        const regex = new RegExp(pattern);
        
        while ((match = regex.exec(text)) !== null) {
          const entity: Entity = {
            id: this.generateEntityId(),
            text: match[0],
            type: entityType,
            startPos: match.index,
            endPos: match.index + match[0].length,
            confidence: this.calculatePatternConfidence(entityType, match[0]),
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          entities.push(entity);
        }
      }
    }

    return entities;
  }

  private async extractByStatistics(
    text: string,
    tokens: string[],
    options: Required<EntityExtractionOptions>
  ): Promise<Entity[]> {
    const entities: Entity[] = [];

    // Extract potential person names (capitalized words)
    if (options.enabledTypes.includes(EntityType.PERSON)) {
      const personRegex = /\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b/g;
      let match;
      
      while ((match = personRegex.exec(text)) !== null) {
        const confidence = this.calculatePersonConfidence(match[0]);
        
        if (confidence >= options.minConfidence) {
          entities.push({
            id: this.generateEntityId(),
            text: match[0],
            type: EntityType.PERSON,
            startPos: match.index,
            endPos: match.index + match[0].length,
            confidence,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    }

    // Extract potential organizations
    if (options.enabledTypes.includes(EntityType.ORGANIZATION)) {
      const orgIndicators = ['Inc', 'LLC', 'Corp', 'Company', 'Corporation', 'Ltd', 'Limited', 'Group'];
      const orgRegex = new RegExp(`\\b[A-Z][a-zA-Z\\s]+(?:${orgIndicators.join('|')})\\b`, 'g');
      let match;
      
      while ((match = orgRegex.exec(text)) !== null) {
        entities.push({
          id: this.generateEntityId(),
          text: match[0],
          type: EntityType.ORGANIZATION,
          startPos: match.index,
          endPos: match.index + match[0].length,
          confidence: 0.8,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Extract potential locations
    if (options.enabledTypes.includes(EntityType.LOCATION)) {
      const locationIndicators = ['Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Boulevard', 'Blvd', 'City', 'State', 'Country'];
      const locationRegex = new RegExp(`\\b[A-Z][a-zA-Z\\s]+(?:${locationIndicators.join('|')})\\b`, 'g');
      let match;
      
      while ((match = locationRegex.exec(text)) !== null) {
        entities.push({
          id: this.generateEntityId(),
          text: match[0],
          type: EntityType.LOCATION,
          startPos: match.index,
          endPos: match.index + match[0].length,
          confidence: 0.7,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return entities;
  }

  private async extractConcepts(
    text: string,
    tokens: string[],
    options: Required<EntityExtractionOptions>
  ): Promise<Entity[]> {
    const entities: Entity[] = [];
    
    if (!options.enabledTypes.includes(EntityType.CONCEPT)) {
      return entities;
    }

    const lowercaseText = text.toLowerCase();
    
    for (const [concept, type] of this.conceptKeywords) {
      const regex = new RegExp(`\\b${concept.replace(/\s+/g, '\\s+')}\\b`, 'g');
      let match;
      
      while ((match = regex.exec(lowercaseText)) !== null) {
        entities.push({
          id: this.generateEntityId(),
          text: text.substring(match.index, match.index + match[0].length),
          type,
          startPos: match.index,
          endPos: match.index + match[0].length,
          confidence: 0.9,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return entities;
  }

  private addContext(text: string, entities: Entity[], contextWindow: number): Entity[] {
    return entities.map(entity => {
      const start = Math.max(0, entity.startPos - contextWindow);
      const end = Math.min(text.length, entity.endPos + contextWindow);
      const context = text.substring(start, end).trim();
      
      return {
        ...entity,
        context,
      };
    });
  }

  private filterByConfidence(entities: Entity[], minConfidence: number): Entity[] {
    return entities.filter(entity => entity.confidence >= minConfidence);
  }

  private mergeOverlappingEntities(entities: Entity[]): Entity[] {
    const sorted = [...entities].sort((a, b) => a.startPos - b.startPos);
    const merged: Entity[] = [];

    for (const entity of sorted) {
      const lastMerged = merged[merged.length - 1];
      
      if (lastMerged && 
          entity.startPos <= lastMerged.endPos && 
          entity.type === lastMerged.type) {
        // Merge overlapping entities of the same type
        lastMerged.text = entity.text.length > lastMerged.text.length ? entity.text : lastMerged.text;
        lastMerged.endPos = Math.max(lastMerged.endPos, entity.endPos);
        lastMerged.confidence = Math.max(lastMerged.confidence, entity.confidence);
      } else {
        merged.push(entity);
      }
    }

    return merged;
  }

  private normalizeEntities(entities: Entity[]): Entity[] {
    return entities.map(entity => {
      const normalized = { ...entity };
      
      switch (entity.type) {
        case EntityType.EMAIL:
          normalized.normalizedValue = entity.text.toLowerCase();
          break;
        case EntityType.PHONE:
          normalized.normalizedValue = entity.text.replace(/\D/g, '');
          break;
        case EntityType.URL:
          normalized.normalizedValue = entity.text.toLowerCase();
          break;
        case EntityType.PERSON:
          normalized.normalizedValue = entity.text
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
          break;
        default:
          normalized.normalizedValue = entity.text;
      }
      
      return normalized;
    });
  }

  private async enhanceWithKnowledgeBase(entities: Entity[]): Promise<Entity[]> {
    // In a real implementation, this would query existing entities in the knowledge base
    // and add additional metadata, aliases, and relationships
    
    return entities.map(entity => {
      // Mock enhancement - in reality, this would query the database
      const enhanced = { ...entity };
      enhanced.mentions = 1; // Would be counted from database
      enhanced.aliases = []; // Would be populated from database
      
      return enhanced;
    });
  }

  private calculatePatternConfidence(type: EntityType, text: string): number {
    // Calculate confidence based on pattern matching quality
    switch (type) {
      case EntityType.EMAIL:
        return text.includes('@') && text.includes('.') ? 0.95 : 0.7;
      case EntityType.URL:
        return text.startsWith('http') ? 0.95 : 0.8;
      case EntityType.PHONE:
        const digits = text.replace(/\D/g, '');
        return digits.length >= 10 ? 0.9 : 0.6;
      case EntityType.DATE:
        return 0.85;
      case EntityType.TIME:
        return 0.8;
      case EntityType.MONEY:
        return 0.9;
      case EntityType.PERCENT:
        return 0.9;
      default:
        return 0.7;
    }
  }

  private calculatePersonConfidence(name: string): number {
    const words = name.split(' ');
    let confidence = 0.5;
    
    // Boost confidence for multiple capitalized words
    if (words.length >= 2 && words.every(word => /^[A-Z][a-z]+$/.test(word))) {
      confidence += 0.3;
    }
    
    // Boost confidence for common name patterns
    if (words.length === 2) {
      confidence += 0.1; // First and last name
    }
    
    // Reduce confidence for very short or very long names
    if (name.length < 4 || name.length > 50) {
      confidence -= 0.2;
    }
    
    return Math.min(1, Math.max(0, confidence));
  }

  private generateEntityId(): string {
    return `entity_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  async saveEntities(entities: Entity[], documentId?: string): Promise<void> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO entities (
          id, name, entity_type, confidence, start_pos, end_pos, 
          context, normalized_value, metadata, document_id, mentions,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const entity of entities) {
        stmt.run(
          entity.id,
          entity.text,
          entity.type,
          entity.confidence,
          entity.startPos,
          entity.endPos,
          entity.context || null,
          entity.normalizedValue || null,
          JSON.stringify(entity.metadata || {}),
          documentId || null,
          entity.mentions || 1,
          entity.createdAt.toISOString(),
          entity.updatedAt.toISOString()
        );
      }

      this.emit('entities_saved', { count: entities.length, documentId });
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to save entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getEntitiesByDocument(documentId: string): Promise<Entity[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      const stmt = db.prepare(`
        SELECT * FROM entities 
        WHERE document_id = ? 
        ORDER BY start_pos ASC
      `);

      const rows = stmt.all(documentId);
      
      return rows.map(row => ({
        id: row.id,
        text: row.name,
        type: row.entity_type as EntityType,
        startPos: row.start_pos,
        endPos: row.end_pos,
        confidence: row.confidence,
        context: row.context,
        normalizedValue: row.normalized_value,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        documentId: row.document_id,
        mentions: row.mentions,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to get entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getEntitiesByType(type: EntityType, limit: number = 100): Promise<Entity[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      const stmt = db.prepare(`
        SELECT * FROM entities 
        WHERE entity_type = ? 
        ORDER BY mentions DESC, confidence DESC
        LIMIT ?
      `);

      const rows = stmt.all(type, limit);
      
      return rows.map(row => ({
        id: row.id,
        text: row.name,
        type: row.entity_type as EntityType,
        startPos: row.start_pos,
        endPos: row.end_pos,
        confidence: row.confidence,
        context: row.context,
        normalizedValue: row.normalized_value,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        documentId: row.document_id,
        mentions: row.mentions,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to get entities by type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default EntityExtractionEngine;