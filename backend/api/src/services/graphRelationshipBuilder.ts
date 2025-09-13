import { EventEmitter } from 'events';
import { DatabaseManager } from '../../database';
import EntityExtractionEngine, { Entity, EntityType } from './entityExtraction';
import SemanticEmbeddingsEngine from './semanticEmbeddings';

// Relationship types in the knowledge graph
export enum RelationshipType {
  // Entity-to-Entity relationships
  PERSON_WORKS_FOR = 'PERSON_WORKS_FOR',
  PERSON_LIVES_IN = 'PERSON_LIVES_IN',
  PERSON_KNOWS = 'PERSON_KNOWS',
  ORGANIZATION_LOCATED_IN = 'ORGANIZATION_LOCATED_IN',
  ORGANIZATION_OWNS = 'ORGANIZATION_OWNS',
  ORGANIZATION_PARTNERS_WITH = 'ORGANIZATION_PARTNERS_WITH',
  
  // Entity-to-Document relationships
  MENTIONED_IN = 'MENTIONED_IN',
  AUTHORED_BY = 'AUTHORED_BY',
  CONTAINS = 'CONTAINS',
  REFERENCES = 'REFERENCES',
  
  // Document-to-Document relationships
  SIMILAR_TO = 'SIMILAR_TO',
  CITES = 'CITES',
  VERSION_OF = 'VERSION_OF',
  DERIVED_FROM = 'DERIVED_FROM',
  
  // Conceptual relationships
  IS_A = 'IS_A',
  PART_OF = 'PART_OF',
  HAS_PROPERTY = 'HAS_PROPERTY',
  CAUSES = 'CAUSES',
  RELATES_TO = 'RELATES_TO',
  
  // Temporal relationships
  BEFORE = 'BEFORE',
  AFTER = 'AFTER',
  DURING = 'DURING',
  
  // Custom relationships
  CUSTOM = 'CUSTOM',
}

export interface GraphRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  sourceType: 'entity' | 'document';
  targetType: 'entity' | 'document';
  relationshipType: RelationshipType;
  confidence: number;
  strength: number;
  evidence: Array<{
    documentId: string;
    context: string;
    position: number;
    confidence: number;
  }>;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface RelationshipBuildingOptions {
  enabledTypes?: RelationshipType[];
  minConfidence?: number;
  maxDistance?: number;
  useSemanticSimilarity?: boolean;
  contextWindow?: number;
  entityTypes?: EntityType[];
  documentTypes?: string[];
}

export interface RelationshipExtractionResult {
  relationships: GraphRelationship[];
  confidence: number;
  processingTime: number;
  entitiesProcessed: number;
  documentsProcessed: number;
}

export class GraphRelationshipBuilder extends EventEmitter {
  private dbManager: DatabaseManager;
  private entityExtractor: EntityExtractionEngine;
  private embeddingsEngine: SemanticEmbeddingsEngine;
  private relationshipPatterns: Map<RelationshipType, RegExp[]>;
  private semanticPatterns: Map<RelationshipType, string[]>;

  constructor() {
    super();
    this.dbManager = new DatabaseManager();
    this.entityExtractor = new EntityExtractionEngine();
    this.embeddingsEngine = new SemanticEmbeddingsEngine();
    this.relationshipPatterns = new Map();
    this.semanticPatterns = new Map();
    this.initializePatterns();
  }

  async initialize(): Promise<void> {
    try {
      await this.dbManager.initialize();
      await this.entityExtractor.initialize();
      await this.embeddingsEngine.initialize();
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private initializePatterns(): void {
    // Pattern-based relationship extraction rules
    this.relationshipPatterns.set(RelationshipType.PERSON_WORKS_FOR, [
      /(\w+(?:\s+\w+)*)\s+(?:works?\s+(?:for|at)|employed?\s+(?:by|at)|job\s+at)\s+(\w+(?:\s+\w+)*)/gi,
      /(\w+(?:\s+\w+)*)\s+(?:is\s+(?:a|an)|serves?\s+as)\s+(?:\w+\s+)*(?:at|of)\s+(\w+(?:\s+\w+)*)/gi,
    ]);

    this.relationshipPatterns.set(RelationshipType.PERSON_LIVES_IN, [
      /(\w+(?:\s+\w+)*)\s+(?:lives?\s+in|resides?\s+in|from)\s+(\w+(?:\s+\w+)*)/gi,
      /(\w+(?:\s+\w+)*)\s+(?:is\s+(?:a|an)\s+)?(?:resident\s+of|citizen\s+of)\s+(\w+(?:\s+\w+)*)/gi,
    ]);

    this.relationshipPatterns.set(RelationshipType.ORGANIZATION_LOCATED_IN, [
      /(\w+(?:\s+\w+)*)\s+(?:is\s+)?(?:located\s+in|based\s+in|headquartered\s+in)\s+(\w+(?:\s+\w+)*)/gi,
      /(\w+(?:\s+\w+)*)\s+(?:has\s+(?:offices?|headquarters?)\s+in)\s+(\w+(?:\s+\w+)*)/gi,
    ]);

    this.relationshipPatterns.set(RelationshipType.ORGANIZATION_OWNS, [
      /(\w+(?:\s+\w+)*)\s+(?:owns?|acquired?|purchased?)\s+(\w+(?:\s+\w+)*)/gi,
      /(\w+(?:\s+\w+)*)\s+(?:is\s+(?:a\s+)?(?:subsidiary|division)\s+of)\s+(\w+(?:\s+\w+)*)/gi,
    ]);

    // Semantic patterns for relationship detection
    this.semanticPatterns.set(RelationshipType.SIMILAR_TO, [
      'similar', 'alike', 'comparable', 'equivalent', 'analogous', 'related'
    ]);

    this.semanticPatterns.set(RelationshipType.CAUSES, [
      'causes', 'leads to', 'results in', 'triggers', 'brings about', 'produces'
    ]);

    this.semanticPatterns.set(RelationshipType.IS_A, [
      'is a', 'is an', 'type of', 'kind of', 'category of', 'instance of'
    ]);

    this.semanticPatterns.set(RelationshipType.PART_OF, [
      'part of', 'component of', 'element of', 'member of', 'belongs to', 'within'
    ]);
  }

  async buildRelationships(
    documentIds?: string[],
    options: RelationshipBuildingOptions = {}
  ): Promise<RelationshipExtractionResult> {
    const startTime = Date.now();
    
    const buildingOptions: Required<RelationshipBuildingOptions> = {
      enabledTypes: options.enabledTypes || Object.values(RelationshipType),
      minConfidence: options.minConfidence || 0.6,
      maxDistance: options.maxDistance || 100,
      useSemanticSimilarity: options.useSemanticSimilarity ?? true,
      contextWindow: options.contextWindow || 200,
      entityTypes: options.entityTypes || Object.values(EntityType),
      documentTypes: options.documentTypes || [],
    };

    try {
      let relationships: GraphRelationship[] = [];
      let entitiesProcessed = 0;
      let documentsProcessed = 0;

      // Get documents to process
      const documents = await this.getDocumentsToProcess(documentIds, buildingOptions.documentTypes);
      documentsProcessed = documents.length;

      for (const document of documents) {
        // Extract entities from document
        const entities = await this.entityExtractor.getEntitiesByDocument(document.id);
        entitiesProcessed += entities.length;

        // Build relationships within this document
        const documentRelationships = await this.extractDocumentRelationships(
          document,
          entities,
          buildingOptions
        );
        relationships.push(...documentRelationships);
      }

      // Build cross-document relationships
      if (buildingOptions.useSemanticSimilarity) {
        const crossDocRelationships = await this.buildCrossDocumentRelationships(
          documents,
          buildingOptions
        );
        relationships.push(...crossDocRelationships);
      }

      // Post-process relationships
      relationships = this.filterAndRankRelationships(relationships, buildingOptions);
      relationships = await this.enhanceRelationshipsWithContext(relationships);

      // Store relationships
      await this.storeRelationships(relationships);

      const processingTime = Date.now() - startTime;
      const avgConfidence = relationships.length > 0 
        ? relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length 
        : 0;

      const result: RelationshipExtractionResult = {
        relationships,
        confidence: avgConfidence,
        processingTime,
        entitiesProcessed,
        documentsProcessed,
      };

      this.emit('relationships_built', result);
      return result;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Relationship building failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getDocumentsToProcess(
    documentIds?: string[],
    documentTypes: string[] = []
  ): Promise<Array<{ id: string; title: string; content: string; fileType: string }>> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      let query = 'SELECT id, title, content, file_type FROM documents WHERE 1=1';
      const params: any[] = [];

      if (documentIds && documentIds.length > 0) {
        query += ` AND id IN (${documentIds.map(() => '?').join(',')})`;
        params.push(...documentIds);
      }

      if (documentTypes.length > 0) {
        query += ` AND file_type IN (${documentTypes.map(() => '?').join(',')})`;
        params.push(...documentTypes);
      }

      query += ' ORDER BY created_at DESC';

      const stmt = db.prepare(query);
      const rows = stmt.all(...params);

      return rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        fileType: row.file_type,
      }));
    } catch (error) {
      throw new Error(`Failed to get documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractDocumentRelationships(
    document: { id: string; title: string; content: string; fileType: string },
    entities: Entity[],
    options: Required<RelationshipBuildingOptions>
  ): Promise<GraphRelationship[]> {
    const relationships: GraphRelationship[] = [];

    // Entity-to-Document relationships
    for (const entity of entities) {
      if (entity.confidence >= options.minConfidence) {
        relationships.push({
          id: this.generateRelationshipId(),
          sourceId: entity.id,
          targetId: document.id,
          sourceType: 'entity',
          targetType: 'document',
          relationshipType: RelationshipType.MENTIONED_IN,
          confidence: entity.confidence,
          strength: entity.confidence,
          evidence: [{
            documentId: document.id,
            context: entity.context || '',
            position: entity.startPos,
            confidence: entity.confidence,
          }],
          metadata: {
            entityType: entity.type,
            documentType: document.fileType,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Entity-to-Entity relationships within document
    const entityRelationships = await this.extractEntityRelationships(
      document,
      entities,
      options
    );
    relationships.push(...entityRelationships);

    return relationships;
  }

  private async extractEntityRelationships(
    document: { id: string; title: string; content: string; fileType: string },
    entities: Entity[],
    options: Required<RelationshipBuildingOptions>
  ): Promise<GraphRelationship[]> {
    const relationships: GraphRelationship[] = [];

    // Pattern-based extraction
    for (const [relType, patterns] of this.relationshipPatterns) {
      if (!options.enabledTypes.includes(relType)) continue;

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(document.content)) !== null) {
          const sourceText = match[1].trim();
          const targetText = match[2].trim();

          // Find matching entities
          const sourceEntity = entities.find(e => 
            e.text.toLowerCase().includes(sourceText.toLowerCase()) ||
            sourceText.toLowerCase().includes(e.text.toLowerCase())
          );
          const targetEntity = entities.find(e => 
            e.text.toLowerCase().includes(targetText.toLowerCase()) ||
            targetText.toLowerCase().includes(e.text.toLowerCase())
          );

          if (sourceEntity && targetEntity && sourceEntity.id !== targetEntity.id) {
            const confidence = this.calculateRelationshipConfidence(
              sourceEntity,
              targetEntity,
              match[0],
              relType
            );

            if (confidence >= options.minConfidence) {
              relationships.push({
                id: this.generateRelationshipId(),
                sourceId: sourceEntity.id,
                targetId: targetEntity.id,
                sourceType: 'entity',
                targetType: 'entity',
                relationshipType: relType,
                confidence,
                strength: confidence,
                evidence: [{
                  documentId: document.id,
                  context: this.extractContext(document.content, match.index, options.contextWindow),
                  position: match.index,
                  confidence,
                }],
                metadata: {
                  sourceEntityType: sourceEntity.type,
                  targetEntityType: targetEntity.type,
                  patternMatch: match[0],
                },
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            }
          }
        }
      }
    }

    // Proximity-based relationships
    const proximityRelationships = this.extractProximityRelationships(
      document,
      entities,
      options
    );
    relationships.push(...proximityRelationships);

    return relationships;
  }

  private extractProximityRelationships(
    document: { id: string; title: string; content: string; fileType: string },
    entities: Entity[],
    options: Required<RelationshipBuildingOptions>
  ): GraphRelationship[] {
    const relationships: GraphRelationship[] = [];

    // Find entities that appear close to each other
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        const distance = Math.abs(entity1.startPos - entity2.startPos);
        
        if (distance <= options.maxDistance) {
          const confidence = this.calculateProximityConfidence(entity1, entity2, distance);
          
          if (confidence >= options.minConfidence) {
            relationships.push({
              id: this.generateRelationshipId(),
              sourceId: entity1.id,
              targetId: entity2.id,
              sourceType: 'entity',
              targetType: 'entity',
              relationshipType: RelationshipType.RELATES_TO,
              confidence,
              strength: confidence,
              evidence: [{
                documentId: document.id,
                context: this.extractContext(
                  document.content, 
                  Math.min(entity1.startPos, entity2.startPos), 
                  options.contextWindow
                ),
                position: Math.min(entity1.startPos, entity2.startPos),
                confidence,
              }],
              metadata: {
                sourceEntityType: entity1.type,
                targetEntityType: entity2.type,
                distance,
                proximityBased: true,
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
      }
    }

    return relationships;
  }

  private async buildCrossDocumentRelationships(
    documents: Array<{ id: string; title: string; content: string; fileType: string }>,
    options: Required<RelationshipBuildingOptions>
  ): Promise<GraphRelationship[]> {
    const relationships: GraphRelationship[] = [];

    try {
      // Use semantic similarity to find related documents
      for (let i = 0; i < documents.length; i++) {
        for (let j = i + 1; j < documents.length; j++) {
          const doc1 = documents[i];
          const doc2 = documents[j];

          // Use semantic search to find similarity
          const searchResults = await this.embeddingsEngine.semanticSearch(
            doc1.content.substring(0, 500), // Use first 500 chars as query
            {
              threshold: options.minConfidence,
              limit: 5,
            }
          );

          const similarDoc = searchResults.find(result => 
            result.documentId === doc2.id && result.similarity >= options.minConfidence
          );

          if (similarDoc) {
            relationships.push({
              id: this.generateRelationshipId(),
              sourceId: doc1.id,
              targetId: doc2.id,
              sourceType: 'document',
              targetType: 'document',
              relationshipType: RelationshipType.SIMILAR_TO,
              confidence: similarDoc.similarity,
              strength: similarDoc.similarity,
              evidence: [{
                documentId: doc1.id,
                context: 'Semantic similarity detected',
                position: 0,
                confidence: similarDoc.similarity,
              }],
              metadata: {
                semanticSimilarity: similarDoc.similarity,
                doc1Type: doc1.fileType,
                doc2Type: doc2.fileType,
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to build cross-document relationships:', error);
    }

    return relationships;
  }

  private calculateRelationshipConfidence(
    sourceEntity: Entity,
    targetEntity: Entity,
    matchText: string,
    relType: RelationshipType
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on entity confidence
    confidence += (sourceEntity.confidence + targetEntity.confidence) / 4;

    // Boost confidence based on relationship type specificity
    const typeBoosts = {
      [RelationshipType.PERSON_WORKS_FOR]: 0.2,
      [RelationshipType.PERSON_LIVES_IN]: 0.2,
      [RelationshipType.ORGANIZATION_LOCATED_IN]: 0.2,
      [RelationshipType.ORGANIZATION_OWNS]: 0.15,
      [RelationshipType.RELATES_TO]: 0.05,
    };

    confidence += typeBoosts[relType] || 0.1;

    // Boost confidence based on match quality
    if (matchText.length > 10) {
      confidence += 0.1;
    }

    // Check entity type compatibility
    if (this.areEntityTypesCompatible(sourceEntity.type, targetEntity.type, relType)) {
      confidence += 0.15;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  private calculateProximityConfidence(
    entity1: Entity,
    entity2: Entity,
    distance: number
  ): number {
    const maxDistance = 100;
    const proximityScore = 1 - (distance / maxDistance);
    const entityConfidenceAvg = (entity1.confidence + entity2.confidence) / 2;
    
    return Math.min(0.7, proximityScore * 0.4 + entityConfidenceAvg * 0.3);
  }

  private areEntityTypesCompatible(
    sourceType: EntityType,
    targetType: EntityType,
    relType: RelationshipType
  ): boolean {
    const compatibilityRules = {
      [RelationshipType.PERSON_WORKS_FOR]: 
        sourceType === EntityType.PERSON && targetType === EntityType.ORGANIZATION,
      [RelationshipType.PERSON_LIVES_IN]: 
        sourceType === EntityType.PERSON && targetType === EntityType.LOCATION,
      [RelationshipType.ORGANIZATION_LOCATED_IN]: 
        sourceType === EntityType.ORGANIZATION && targetType === EntityType.LOCATION,
      [RelationshipType.ORGANIZATION_OWNS]: 
        sourceType === EntityType.ORGANIZATION && 
        (targetType === EntityType.ORGANIZATION || targetType === EntityType.PRODUCT),
    };

    return compatibilityRules[relType] ?? true; // Default to compatible
  }

  private extractContext(text: string, position: number, windowSize: number): string {
    const start = Math.max(0, position - windowSize / 2);
    const end = Math.min(text.length, position + windowSize / 2);
    return text.substring(start, end).trim();
  }

  private filterAndRankRelationships(
    relationships: GraphRelationship[],
    options: Required<RelationshipBuildingOptions>
  ): GraphRelationship[] {
    // Remove duplicates
    const uniqueRelationships = new Map<string, GraphRelationship>();
    
    for (const rel of relationships) {
      const key = `${rel.sourceId}-${rel.targetId}-${rel.relationshipType}`;
      const existing = uniqueRelationships.get(key);
      
      if (!existing || rel.confidence > existing.confidence) {
        uniqueRelationships.set(key, rel);
      }
    }

    // Filter by confidence and sort by strength
    return Array.from(uniqueRelationships.values())
      .filter(rel => rel.confidence >= options.minConfidence)
      .sort((a, b) => b.strength - a.strength);
  }

  private async enhanceRelationshipsWithContext(
    relationships: GraphRelationship[]
  ): Promise<GraphRelationship[]> {
    // Add additional context and metadata to relationships
    return relationships.map(rel => ({
      ...rel,
      metadata: {
        ...rel.metadata,
        evidenceCount: rel.evidence.length,
        avgEvidenceConfidence: rel.evidence.reduce((sum, e) => sum + e.confidence, 0) / rel.evidence.length,
      },
    }));
  }

  async storeRelationships(relationships: GraphRelationship[]): Promise<void> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO relationships (
          id, source_entity_id, target_entity_id, relationship_type, 
          confidence, strength, evidence, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction(() => {
        for (const rel of relationships) {
          stmt.run(
            rel.id,
            rel.sourceId,
            rel.targetId,
            rel.relationshipType,
            rel.confidence,
            rel.strength,
            JSON.stringify(rel.evidence),
            JSON.stringify(rel.metadata),
            rel.createdAt.toISOString(),
            rel.updatedAt.toISOString()
          );
        }
      });

      transaction();
      
      this.emit('relationships_stored', { count: relationships.length });
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to store relationships: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRelationshipsByEntity(entityId: string): Promise<GraphRelationship[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      const stmt = db.prepare(`
        SELECT * FROM relationships 
        WHERE source_entity_id = ? OR target_entity_id = ?
        ORDER BY strength DESC
      `);

      const rows = stmt.all(entityId, entityId);
      
      return rows.map(row => this.mapRowToRelationship(row));
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to get relationships: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRelationshipsByType(type: RelationshipType): Promise<GraphRelationship[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      const stmt = db.prepare(`
        SELECT * FROM relationships 
        WHERE relationship_type = ?
        ORDER BY strength DESC
      `);

      const rows = stmt.all(type);
      
      return rows.map(row => this.mapRowToRelationship(row));
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to get relationships by type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private mapRowToRelationship(row: any): GraphRelationship {
    return {
      id: row.id,
      sourceId: row.source_entity_id,
      targetId: row.target_entity_id,
      sourceType: 'entity', // Default, could be enhanced
      targetType: 'entity', // Default, could be enhanced
      relationshipType: row.relationship_type as RelationshipType,
      confidence: row.confidence,
      strength: row.strength,
      evidence: row.evidence ? JSON.parse(row.evidence) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private generateRelationshipId(): string {
    return `rel_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  async deleteRelationshipsByDocument(documentId: string): Promise<number> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      const stmt = db.prepare(`
        DELETE FROM relationships 
        WHERE source_entity_id IN (
          SELECT id FROM entities WHERE document_id = ?
        ) OR target_entity_id IN (
          SELECT id FROM entities WHERE document_id = ?
        )
      `);

      const result = stmt.run(documentId, documentId);
      
      this.emit('relationships_deleted', { count: result.changes, documentId });
      return result.changes;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to delete relationships: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default GraphRelationshipBuilder;