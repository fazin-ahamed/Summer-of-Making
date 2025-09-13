import { EventEmitter } from 'events';
import { DatabaseManager } from '../../database';
import { v4 as uuidv4 } from 'uuid';

// Type definitions for entity functionality
export interface Entity {
  id: string;
  type: string;
  name: string;
  properties: Record<string, any>;
  confidence?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface EntityMention {
  id: string;
  entityId: string;
  documentId: string;
  startPosition: number;
  endPosition: number;
  confidence: number;
  context?: string;
  documentTitle?: string;
}

export interface EntityRelation {
  entity: Entity;
  relationship: {
    id: string;
    type: string;
    strength: number;
    properties: Record<string, any>;
  };
  distance: number;
}

export interface EntityCreateRequest {
  type: string;
  name: string;
  properties?: Record<string, any>;
  confidence?: number;
}

export interface EntityUpdateRequest {
  id: string;
  type?: string;
  name?: string;
  properties?: Record<string, any>;
  confidence?: number;
}

export interface EntityListRequest {
  type?: string;
  search?: string;
  pagination?: {
    page: number;
    limit: number;
  };
  sortBy: string;
  sortOrder: string;
}

export interface EntitySearchRequest {
  query: string;
  type?: string;
  properties?: Record<string, any>;
  limit: number;
  includeRelations: boolean;
}

export interface BulkEntityOperation {
  operation: 'create' | 'update' | 'delete';
  entities: any[];
}

export interface EntityMergeRequest {
  sourceId: string;
  targetId: string;
  mergeStrategy: 'prefer_source' | 'prefer_target' | 'merge_properties';
}

export class EntityService extends EventEmitter {
  private dbManager: DatabaseManager;

  constructor() {
    super();
    this.dbManager = new DatabaseManager();
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

  async getEntityById(id: string): Promise<Entity | null> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const stmt = db.prepare(`
        SELECT id, entity_type, name, properties, confidence, created_at
        FROM entities 
        WHERE id = ?
      `);
      
      const row = stmt.get(id);
      if (!row) return null;

      return this.transformDbEntity(row);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async listEntities(request: EntityListRequest): Promise<{ entities: Entity[]; total: number }> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const { page = 1, limit = 20 } = request.pagination || {};
      const offset = (page - 1) * limit;

      // Build query conditions
      let whereClause = '';
      const params: any[] = [];

      if (request.type) {
        whereClause += ' WHERE entity_type = ?';
        params.push(request.type);
      }

      if (request.search) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ' (name LIKE ? OR properties LIKE ?)';
        params.push(`%${request.search}%`, `%${request.search}%`);
      }

      // Get total count
      const countStmt = db.prepare(`SELECT COUNT(*) as total FROM entities${whereClause}`);
      const totalResult = countStmt.get(...params);
      const total = totalResult.total;

      // Get entities with pagination
      const orderClause = `ORDER BY ${this.getOrderClause(request.sortBy, request.sortOrder)}`;
      const entitiesStmt = db.prepare(`
        SELECT id, entity_type, name, properties, confidence, created_at
        FROM entities${whereClause} ${orderClause}
        LIMIT ? OFFSET ?
      `);
      
      const rows = entitiesStmt.all(...params, limit, offset);
      const entities = rows.map(row => this.transformDbEntity(row));

      return { entities, total };
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async getEntityTypes(): Promise<Array<{ type: string; count: number }>> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const stmt = db.prepare(`
        SELECT entity_type as type, COUNT(*) as count
        FROM entities 
        GROUP BY entity_type 
        ORDER BY count DESC
      `);
      
      return stmt.all();
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async getRelatedEntities(request: {
    id: string;
    relationshipTypes?: string[];
    maxDepth: number;
    limit: number;
    includeProperties: boolean;
  }): Promise<EntityRelation[]> {
    try {
      // Mock implementation - in real scenario, this would query the graph database
      const entity = await this.getEntityById(request.id);
      if (!entity) return [];

      // For now, return mock related entities
      const mockRelations: EntityRelation[] = [
        {
          entity: {
            id: uuidv4(),
            type: 'PERSON',
            name: 'Related Person',
            properties: { role: 'colleague' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          relationship: {
            id: uuidv4(),
            type: 'WORKS_WITH',
            strength: 0.8,
            properties: { since: '2023' },
          },
          distance: 1,
        },
      ];

      return mockRelations.slice(0, request.limit);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async getEntityMentions(request: {
    id: string;
    documentIds?: string[];
    limit: number;
    includeContext: boolean;
  }): Promise<EntityMention[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      let whereClause = 'WHERE entity_id = ?';
      const params = [request.id];

      if (request.documentIds && request.documentIds.length > 0) {
        whereClause += ` AND document_id IN (${request.documentIds.map(() => '?').join(',')})`;
        params.push(...request.documentIds);
      }

      const stmt = db.prepare(`
        SELECT em.id, em.entity_id, em.document_id, em.start_position, 
               em.end_position, em.confidence, d.title as document_title
        FROM entity_mentions em
        LEFT JOIN documents d ON em.document_id = d.id
        ${whereClause}
        ORDER BY em.confidence DESC
        LIMIT ?
      `);

      const rows = stmt.all(...params, request.limit);
      
      return rows.map(row => ({
        id: row.id,
        entityId: row.entity_id,
        documentId: row.document_id,
        startPosition: row.start_position,
        endPosition: row.end_position,
        confidence: row.confidence,
        documentTitle: row.document_title,
        context: request.includeContext ? this.getContextForMention(row) : undefined,
      }));
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async createEntity(request: EntityCreateRequest, userId?: string): Promise<Entity> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const id = uuidv4();
      const now = new Date().toISOString();

      const stmt = db.prepare(`
        INSERT INTO entities (id, entity_type, name, properties, confidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        request.type,
        request.name,
        JSON.stringify(request.properties || {}),
        request.confidence || null,
        Date.now()
      );

      const entity: Entity = {
        id,
        type: request.type,
        name: request.name,
        properties: request.properties || {},
        confidence: request.confidence,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      };

      this.emit('entityCreated', entity);
      return entity;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async updateEntity(request: EntityUpdateRequest, userId?: string): Promise<Entity | null> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const existing = await this.getEntityById(request.id);
      if (!existing) return null;

      const updates: string[] = [];
      const params: any[] = [];

      if (request.type !== undefined) {
        updates.push('entity_type = ?');
        params.push(request.type);
      }
      if (request.name !== undefined) {
        updates.push('name = ?');
        params.push(request.name);
      }
      if (request.properties !== undefined) {
        updates.push('properties = ?');
        params.push(JSON.stringify(request.properties));
      }
      if (request.confidence !== undefined) {
        updates.push('confidence = ?');
        params.push(request.confidence);
      }

      if (updates.length === 0) return existing;

      params.push(request.id);

      const stmt = db.prepare(`
        UPDATE entities 
        SET ${updates.join(', ')}
        WHERE id = ?
      `);

      stmt.run(...params);

      const updated = await this.getEntityById(request.id);
      if (updated) {
        this.emit('entityUpdated', updated);
      }
      
      return updated;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async deleteEntity(id: string, userId?: string): Promise<boolean> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const entity = await this.getEntityById(id);
      if (!entity) return false;

      // Delete entity mentions first (foreign key constraint)
      const deleteMentionsStmt = db.prepare('DELETE FROM entity_mentions WHERE entity_id = ?');
      deleteMentionsStmt.run(id);

      // Delete the entity
      const deleteEntityStmt = db.prepare('DELETE FROM entities WHERE id = ?');
      const result = deleteEntityStmt.run(id);

      if (result.changes > 0) {
        this.emit('entityDeleted', { id, deletedBy: userId });
        return true;
      }
      
      return false;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async bulkEntityOperation(operation: BulkEntityOperation, userId?: string): Promise<any> {
    try {
      const results = {
        successful: 0,
        failed: 0,
        errors: [] as string[],
        entities: [] as Entity[],
      };

      for (const entityData of operation.entities) {
        try {
          let result;
          switch (operation.operation) {
            case 'create':
              result = await this.createEntity(entityData, userId);
              results.entities.push(result);
              break;
            case 'update':
              result = await this.updateEntity(entityData, userId);
              if (result) results.entities.push(result);
              break;
            case 'delete':
              await this.deleteEntity(entityData.id, userId);
              break;
          }
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${operation.operation} failed for entity: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return results;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async mergeEntities(request: EntityMergeRequest, userId?: string): Promise<Entity> {
    try {
      const [sourceEntity, targetEntity] = await Promise.all([
        this.getEntityById(request.sourceId),
        this.getEntityById(request.targetId),
      ]);

      if (!sourceEntity || !targetEntity) {
        throw new Error('One or both entities not found');
      }

      let mergedProperties: Record<string, any>;
      let mergedName: string;
      let mergedType: string;

      switch (request.mergeStrategy) {
        case 'prefer_source':
          mergedProperties = { ...targetEntity.properties, ...sourceEntity.properties };
          mergedName = sourceEntity.name;
          mergedType = sourceEntity.type;
          break;
        case 'prefer_target':
          mergedProperties = { ...sourceEntity.properties, ...targetEntity.properties };
          mergedName = targetEntity.name;
          mergedType = targetEntity.type;
          break;
        case 'merge_properties':
        default:
          mergedProperties = this.mergeEntityProperties(sourceEntity.properties, targetEntity.properties);
          mergedName = targetEntity.name; // Prefer target name
          mergedType = targetEntity.type; // Prefer target type
          break;
      }

      // Update target entity with merged data
      const mergedEntity = await this.updateEntity({
        id: request.targetId,
        name: mergedName,
        type: mergedType,
        properties: mergedProperties,
      }, userId);

      // Update entity mentions to point to target entity
      const db = this.dbManager.getSQLiteConnection();
      const updateMentionsStmt = db.prepare(`
        UPDATE entity_mentions 
        SET entity_id = ? 
        WHERE entity_id = ?
      `);
      updateMentionsStmt.run(request.targetId, request.sourceId);

      // Delete source entity
      await this.deleteEntity(request.sourceId, userId);

      if (!mergedEntity) {
        throw new Error('Failed to create merged entity');
      }

      this.emit('entitiesMerged', { sourceId: request.sourceId, targetId: request.targetId, mergedEntity });
      return mergedEntity;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async searchEntities(request: EntitySearchRequest): Promise<Entity[]> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const searchTerms = request.query.toLowerCase().split(' ');
      
      let whereClause = 'WHERE (';
      const params: any[] = [];

      // Search in name and properties
      const searchConditions = searchTerms.map(() => '(LOWER(name) LIKE ? OR LOWER(properties) LIKE ?)');
      whereClause += searchConditions.join(' AND ') + ')';
      
      searchTerms.forEach(term => {
        params.push(`%${term}%`, `%${term}%`);
      });

      if (request.type) {
        whereClause += ' AND entity_type = ?';
        params.push(request.type);
      }

      const stmt = db.prepare(`
        SELECT id, entity_type, name, properties, confidence, created_at
        FROM entities 
        ${whereClause}
        ORDER BY confidence DESC, name ASC
        LIMIT ?
      `);

      const rows = stmt.all(...params, request.limit);
      return rows.map(row => this.transformDbEntity(row));
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async getEntityStatistics(request: {
    timeRange: string;
    groupBy: string;
  }): Promise<any> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      const dateCondition = this.getDateCondition(request.timeRange);

      switch (request.groupBy) {
        case 'type':
          const typeStmt = db.prepare(`
            SELECT entity_type, COUNT(*) as count
            FROM entities 
            WHERE ${dateCondition}
            GROUP BY entity_type 
            ORDER BY count DESC
          `);
          return { byType: typeStmt.all() };

        case 'confidence':
          const confidenceStmt = db.prepare(`
            SELECT 
              CASE 
                WHEN confidence >= 0.8 THEN 'high'
                WHEN confidence >= 0.5 THEN 'medium'
                WHEN confidence < 0.5 THEN 'low'
                ELSE 'unknown'
              END as confidence_level,
              COUNT(*) as count
            FROM entities 
            WHERE ${dateCondition}
            GROUP BY confidence_level
          `);
          return { byConfidence: confidenceStmt.all() };

        case 'creation_date':
        default:
          const dateStmt = db.prepare(`
            SELECT DATE(datetime(created_at/1000, 'unixepoch')) as date, COUNT(*) as count
            FROM entities 
            WHERE ${dateCondition}
            GROUP BY DATE(datetime(created_at/1000, 'unixepoch'))
            ORDER BY date
          `);
          return { byDate: dateStmt.all() };
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async validateEntities(entities: Array<{ type: string; name: string; properties?: Record<string, any> }>): Promise<any> {
    const results = {
      valid: 0,
      invalid: 0,
      errors: [] as string[],
      warnings: [] as string[],
    };

    entities.forEach((entity, index) => {
      try {
        if (!entity.type || entity.type.trim().length === 0) {
          results.errors.push(`Entity ${index}: type is required`);
          results.invalid++;
          return;
        }

        if (!entity.name || entity.name.trim().length === 0) {
          results.errors.push(`Entity ${index}: name is required`);
          results.invalid++;
          return;
        }

        if (entity.name.length > 255) {
          results.warnings.push(`Entity ${index}: name is very long (${entity.name.length} characters)`);
        }

        results.valid++;
      } catch (error) {
        results.errors.push(`Entity ${index}: validation error`);
        results.invalid++;
      }
    });

    return results;
  }

  async exportEntities(request: any, userId?: string): Promise<any> {
    try {
      const db = this.dbManager.getSQLiteConnection();
      
      let whereClause = '';
      const params: any[] = [];

      if (request.filters?.types && request.filters.types.length > 0) {
        whereClause = `WHERE entity_type IN (${request.filters.types.map(() => '?').join(',')})`;
        params.push(...request.filters.types);
      }

      if (request.filters?.createdAfter) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ' created_at >= ?';
        params.push(new Date(request.filters.createdAfter).getTime());
      }

      const stmt = db.prepare(`
        SELECT id, entity_type, name, properties, confidence, created_at
        FROM entities 
        ${whereClause}
        ORDER BY entity_type, name
      `);

      const entities = stmt.all(...params).map(row => this.transformDbEntity(row));

      switch (request.format) {
        case 'csv':
          return this.exportToCSV(entities);
        case 'rdf':
          return this.exportToRDF(entities);
        case 'json':
        default:
          return {
            format: 'json',
            data: entities,
            metadata: {
              exportedAt: new Date().toISOString(),
              exportedBy: userId,
              count: entities.length,
            },
          };
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private transformDbEntity(row: any): Entity {
    return {
      id: row.id,
      type: row.entity_type,
      name: row.name,
      properties: JSON.parse(row.properties || '{}'),
      confidence: row.confidence,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.created_at).toISOString(), // Using created_at as we don't track updated_at yet
    };
  }

  private getOrderClause(sortBy: string, sortOrder: string): string {
    const direction = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    switch (sortBy) {
      case 'type':
        return `entity_type ${direction}`;
      case 'created_at':
        return `created_at ${direction}`;
      case 'confidence':
        return `confidence ${direction}`;
      case 'name':
      default:
        return `name ${direction}`;
    }
  }

  private getDateCondition(timeRange: string): string {
    const now = Date.now();
    let timestamp: number;

    switch (timeRange) {
      case 'day':
        timestamp = now - (24 * 60 * 60 * 1000);
        break;
      case 'week':
        timestamp = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        timestamp = now - (30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        timestamp = now - (365 * 24 * 60 * 60 * 1000);
        break;
      default:
        timestamp = now - (30 * 24 * 60 * 60 * 1000);
    }

    return `created_at >= ${timestamp}`;
  }

  private getContextForMention(mention: any): string {
    // Mock context extraction - in real implementation, this would extract surrounding text
    return `...context around entity mention at position ${mention.start_position}-${mention.end_position}...`;
  }

  private mergeEntityProperties(props1: Record<string, any>, props2: Record<string, any>): Record<string, any> {
    const merged = { ...props1 };
    
    Object.entries(props2).forEach(([key, value]) => {
      if (merged[key] === undefined) {
        merged[key] = value;
      } else if (Array.isArray(merged[key]) && Array.isArray(value)) {
        merged[key] = [...new Set([...merged[key], ...value])];
      } else if (typeof merged[key] === 'object' && typeof value === 'object') {
        merged[key] = { ...merged[key], ...value };
      }
      // For primitive values, keep the existing value (props1 takes precedence)
    });

    return merged;
  }

  private exportToCSV(entities: Entity[]): any {
    const headers = ['id', 'type', 'name', 'confidence', 'createdAt', 'properties'];
    const rows = entities.map(entity => [
      entity.id,
      entity.type,
      entity.name,
      entity.confidence || '',
      entity.createdAt,
      JSON.stringify(entity.properties),
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    return {
      format: 'csv',
      data: csvContent,
      metadata: {
        exportedAt: new Date().toISOString(),
        count: entities.length,
      },
    };
  }

  private exportToRDF(entities: Entity[]): any {
    // Simple RDF/XML export
    let rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ao="http://autoorganize.org/ontology#">
`;

    entities.forEach(entity => {
      rdf += `  <ao:Entity rdf:about="urn:entity:${entity.id}">
    <ao:type>${entity.type}</ao:type>
    <ao:name>${entity.name}</ao:name>
    <ao:createdAt>${entity.createdAt}</ao:createdAt>
`;
      if (entity.confidence) {
        rdf += `    <ao:confidence>${entity.confidence}</ao:confidence>
`;
      }
      
      Object.entries(entity.properties).forEach(([key, value]) => {
        rdf += `    <ao:${key}>${JSON.stringify(value)}</ao:${key}>
`;
      });
      
      rdf += `  </ao:Entity>
`;
    });

    rdf += `</rdf:RDF>`;

    return {
      format: 'rdf',
      data: rdf,
      metadata: {
        exportedAt: new Date().toISOString(),
        count: entities.length,
      },
    };
  }
}