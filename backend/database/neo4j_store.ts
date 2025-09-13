import neo4j, { Driver, Session, Result, Record } from 'neo4j-driver';
import { 
  Entity, 
  GraphRelationship, 
  ApiResponse,
  AutoOrganizeError 
} from '@autoorganize/types';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
  connectionTimeout?: number;
}

export interface GraphQuery {
  cypher: string;
  parameters?: Record<string, any>;
}

export interface GraphQueryResult {
  records: Record<string, any>[];
  summary: {
    executionTime: number;
    recordCount: number;
    nodesCreated?: number;
    relationshipsCreated?: number;
    nodesDeleted?: number;
    relationshipsDeleted?: number;
  };
}

export interface PathResult {
  nodes: Entity[];
  relationships: GraphRelationship[];
  length: number;
}

export class Neo4jGraphStore {
  private driver: Driver;
  private database: string;

  constructor(config: Neo4jConfig) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password),
      {
        maxConnectionPoolSize: config.maxConnectionPoolSize || 100,
        connectionAcquisitionTimeout: config.connectionTimeout || 30000,
      }
    );
    this.database = config.database || 'neo4j';
  }

  async initialize(): Promise<void> {
    // Verify connectivity and create indexes
    const session = this.driver.session({ database: this.database });
    
    try {
      // Test connection
      await session.run('RETURN 1');
      
      // Create indexes for better performance
      await this.createIndexes(session);
      
      // Create constraints
      await this.createConstraints(session);
      
    } finally {
      await session.close();
    }
  }

  private async createIndexes(session: Session): Promise<void> {
    const indexes = [
      'CREATE INDEX entity_id_index IF NOT EXISTS FOR (e:Entity) ON (e.id)',
      'CREATE INDEX entity_type_index IF NOT EXISTS FOR (e:Entity) ON (e.type)',
      'CREATE INDEX entity_name_index IF NOT EXISTS FOR (e:Entity) ON (e.name)',
      'CREATE INDEX document_id_index IF NOT EXISTS FOR (d:Document) ON (d.id)',
      'CREATE INDEX document_path_index IF NOT EXISTS FOR (d:Document) ON (d.file_path)',
      'CREATE TEXT INDEX entity_name_text_index IF NOT EXISTS FOR (e:Entity) ON (e.name)',
      'CREATE TEXT INDEX document_title_text_index IF NOT EXISTS FOR (d:Document) ON (d.title)',
    ];

    for (const indexQuery of indexes) {
      try {
        await session.run(indexQuery);
      } catch (error) {
        // Index might already exist, continue
        console.warn(`Index creation warning: ${error}`);
      }
    }
  }

  private async createConstraints(session: Session): Promise<void> {
    const constraints = [
      'CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE',
      'CREATE CONSTRAINT document_id_unique IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE',
    ];

    for (const constraintQuery of constraints) {
      try {
        await session.run(constraintQuery);
      } catch (error) {
        // Constraint might already exist, continue
        console.warn(`Constraint creation warning: ${error}`);
      }
    }
  }

  async storeEntity(entity: Entity): Promise<void> {
    const session = this.driver.session({ database: this.database });
    
    try {
      const query = `
        MERGE (e:Entity {id: $id})
        SET e.type = $type,
            e.name = $name,
            e.properties = $properties,
            e.created_at = $created_at,
            e.confidence = $confidence,
            e.updated_at = datetime()
      `;

      await session.run(query, {
        id: entity.id,
        type: entity.type,
        name: entity.name,
        properties: entity.properties,
        created_at: entity.created_at.toISOString(),
        confidence: entity.confidence || 1.0,
      });
    } finally {
      await session.close();
    }
  }

  async getEntity(entityId: string): Promise<Entity | null> {
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(
        'MATCH (e:Entity {id: $id}) RETURN e',
        { id: entityId }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      return this.recordToEntity(record.get('e'));
    } finally {
      await session.close();
    }
  }

  async storeRelationship(relationship: GraphRelationship): Promise<void> {
    const session = this.driver.session({ database: this.database });
    
    try {
      // First ensure both entities exist
      await this.ensureEntitiesExist(session, [
        relationship.source_entity_id,
        relationship.target_entity_id,
      ]);

      const query = `
        MATCH (source:Entity {id: $source_id})
        MATCH (target:Entity {id: $target_id})
        MERGE (source)-[r:RELATED {id: $rel_id}]->(target)
        SET r.type = $rel_type,
            r.strength = $strength,
            r.properties = $properties,
            r.created_at = $created_at,
            r.updated_at = datetime()
      `;

      await session.run(query, {
        source_id: relationship.source_entity_id,
        target_id: relationship.target_entity_id,
        rel_id: relationship.id,
        rel_type: relationship.relationship_type,
        strength: relationship.strength,
        properties: relationship.properties,
        created_at: relationship.created_at.toISOString(),
      });
    } finally {
      await session.close();
    }
  }

  private async ensureEntitiesExist(session: Session, entityIds: string[]): Promise<void> {
    for (const entityId of entityIds) {
      await session.run(
        'MERGE (e:Entity {id: $id}) ON CREATE SET e.name = $id, e.type = "unknown", e.created_at = datetime()',
        { id: entityId }
      );
    }
  }

  async getRelatedEntities(
    entityId: string, 
    relationshipTypes?: string[], 
    maxDepth: number = 1,
    limit: number = 50
  ): Promise<Entity[]> {
    const session = this.driver.session({ database: this.database });
    
    try {
      let relationshipFilter = '';
      if (relationshipTypes && relationshipTypes.length > 0) {
        const typeConditions = relationshipTypes.map(type => `r.type = '${type}'`).join(' OR ');
        relationshipFilter = `WHERE ${typeConditions}`;
      }

      const query = `
        MATCH (start:Entity {id: $id})-[r:RELATED*1..${maxDepth}]-(related:Entity)
        ${relationshipFilter}
        RETURN DISTINCT related
        LIMIT $limit
      `;

      const result = await session.run(query, { 
        id: entityId, 
        limit: neo4j.int(limit) 
      });

      return result.records.map(record => this.recordToEntity(record.get('related')));
    } finally {
      await session.close();
    }
  }

  async findShortestPath(sourceId: string, targetId: string): Promise<PathResult | null> {
    const session = this.driver.session({ database: this.database });
    
    try {
      const query = `
        MATCH (source:Entity {id: $source_id}), (target:Entity {id: $target_id})
        MATCH path = shortestPath((source)-[*]-(target))
        RETURN path
      `;

      const result = await session.run(query, {
        source_id: sourceId,
        target_id: targetId,
      });

      if (result.records.length === 0) {
        return null;
      }

      const path = result.records[0].get('path');
      return this.pathToResult(path);
    } finally {
      await session.close();
    }
  }

  async getEntityByType(
    entityType: string, 
    limit: number = 50, 
    skip: number = 0
  ): Promise<Entity[]> {
    const session = this.driver.session({ database: this.database });
    
    try {
      const result = await session.run(
        `MATCH (e:Entity {type: $type}) 
         RETURN e 
         ORDER BY e.name 
         SKIP $skip 
         LIMIT $limit`,
        { 
          type: entityType, 
          skip: neo4j.int(skip), 
          limit: neo4j.int(limit) 
        }
      );

      return result.records.map(record => this.recordToEntity(record.get('e')));
    } finally {
      await session.close();
    }
  }

  async searchEntities(
    searchTerm: string, 
    entityTypes?: string[], 
    limit: number = 20
  ): Promise<Entity[]> {
    const session = this.driver.session({ database: this.database });
    
    try {
      let typeFilter = '';
      if (entityTypes && entityTypes.length > 0) {
        typeFilter = `AND e.type IN $types`;
      }

      const query = `
        CALL db.index.fulltext.queryNodes('entity_name_text_index', $searchTerm) 
        YIELD node AS e, score
        WHERE e:Entity ${typeFilter}
        RETURN e
        ORDER BY score DESC
        LIMIT $limit
      `;

      const result = await session.run(query, {
        searchTerm,
        types: entityTypes,
        limit: neo4j.int(limit),
      });

      return result.records.map(record => this.recordToEntity(record.get('e')));
    } finally {
      await session.close();
    }
  }

  async getMostConnectedEntities(limit: number = 10): Promise<Array<{entity: Entity, connections: number}>> {
    const session = this.driver.session({ database: this.database });
    
    try {
      const query = `
        MATCH (e:Entity)-[r:RELATED]-(connected)
        WITH e, count(r) as connections
        ORDER BY connections DESC
        LIMIT $limit
        RETURN e, connections
      `;

      const result = await session.run(query, { limit: neo4j.int(limit) });

      return result.records.map(record => ({
        entity: this.recordToEntity(record.get('e')),
        connections: record.get('connections').toNumber(),
      }));
    } finally {
      await session.close();
    }
  }

  async getGraphStatistics(): Promise<{
    totalEntities: number;
    totalRelationships: number;
    entityTypes: Record<string, number>;
    relationshipTypes: Record<string, number>;
  }> {
    const session = this.driver.session({ database: this.database });
    
    try {
      // Get total counts
      const countResult = await session.run(`
        MATCH (e:Entity) 
        OPTIONAL MATCH ()-[r:RELATED]->()
        RETURN count(DISTINCT e) as entityCount, count(r) as relationshipCount
      `);

      const totalEntities = countResult.records[0].get('entityCount').toNumber();
      const totalRelationships = countResult.records[0].get('relationshipCount').toNumber();

      // Get entity type distribution
      const entityTypeResult = await session.run(`
        MATCH (e:Entity)
        RETURN e.type as type, count(e) as count
        ORDER BY count DESC
      `);

      const entityTypes: Record<string, number> = {};
      entityTypeResult.records.forEach(record => {
        entityTypes[record.get('type')] = record.get('count').toNumber();
      });

      // Get relationship type distribution
      const relTypeResult = await session.run(`
        MATCH ()-[r:RELATED]->()
        RETURN r.type as type, count(r) as count
        ORDER BY count DESC
      `);

      const relationshipTypes: Record<string, number> = {};
      relTypeResult.records.forEach(record => {
        relationshipTypes[record.get('type')] = record.get('count').toNumber();
      });

      return {
        totalEntities,
        totalRelationships,
        entityTypes,
        relationshipTypes,
      };
    } finally {
      await session.close();
    }
  }

  async executeCustomQuery(query: GraphQuery): Promise<GraphQueryResult> {
    const session = this.driver.session({ database: this.database });
    const startTime = Date.now();
    
    try {
      const result = await session.run(query.cypher, query.parameters || {});
      const executionTime = Date.now() - startTime;

      const records = result.records.map(record => {
        const obj: Record<string, any> = {};
        record.keys.forEach(key => {
          obj[key] = this.convertNeo4jValue(record.get(key));
        });
        return obj;
      });

      return {
        records,
        summary: {
          executionTime,
          recordCount: records.length,
          nodesCreated: result.summary.counters?.nodesCreated(),
          relationshipsCreated: result.summary.counters?.relationshipsCreated(),
          nodesDeleted: result.summary.counters?.nodesDeleted(),
          relationshipsDeleted: result.summary.counters?.relationshipsDeleted(),
        },
      };
    } finally {
      await session.close();
    }
  }

  async deleteEntity(entityId: string): Promise<void> {
    const session = this.driver.session({ database: this.database });
    
    try {
      await session.run(
        'MATCH (e:Entity {id: $id}) DETACH DELETE e',
        { id: entityId }
      );
    } finally {
      await session.close();
    }
  }

  async deleteRelationship(relationshipId: string): Promise<void> {
    const session = this.driver.session({ database: this.database });
    
    try {
      await session.run(
        'MATCH ()-[r:RELATED {id: $id}]->() DELETE r',
        { id: relationshipId }
      );
    } finally {
      await session.close();
    }
  }

  private recordToEntity(node: any): Entity {
    const properties = node.properties;
    return {
      id: properties.id,
      type: properties.type,
      name: properties.name,
      properties: properties.properties || {},
      created_at: new Date(properties.created_at),
      confidence: properties.confidence,
    };
  }

  private pathToResult(path: any): PathResult {
    const nodes = path.segments.map((segment: any) => this.recordToEntity(segment.start));
    // Add the end node of the last segment
    if (path.segments.length > 0) {
      const lastSegment = path.segments[path.segments.length - 1];
      nodes.push(this.recordToEntity(lastSegment.end));
    }

    const relationships = path.segments.map((segment: any) => {
      const rel = segment.relationship;
      return {
        id: rel.properties.id,
        source_entity_id: rel.start.toString(),
        target_entity_id: rel.end.toString(),
        relationship_type: rel.properties.type,
        strength: rel.properties.strength,
        properties: rel.properties.properties || {},
        created_at: new Date(rel.properties.created_at),
      } as GraphRelationship;
    });

    return {
      nodes,
      relationships,
      length: path.length,
    };
  }

  private convertNeo4jValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      if (value.constructor.name === 'Integer') {
        return value.toNumber();
      }
      if (value.constructor.name === 'Node') {
        return this.recordToEntity(value);
      }
      if (value.constructor.name === 'Relationship') {
        return {
          id: value.properties.id,
          type: value.type,
          properties: value.properties,
        };
      }
      if (Array.isArray(value)) {
        return value.map(item => this.convertNeo4jValue(item));
      }
    }

    return value;
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async verifyConnectivity(): Promise<boolean> {
    const session = this.driver.session({ database: this.database });
    
    try {
      await session.run('RETURN 1');
      return true;
    } catch (error) {
      console.error('Neo4j connectivity check failed:', error);
      return false;
    } finally {
      await session.close();
    }
  }
}

export default Neo4jGraphStore;
