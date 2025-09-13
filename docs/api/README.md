# AutoOrganize API Documentation

## Overview

The AutoOrganize API provides a comprehensive set of endpoints for document ingestion, search, entity extraction, and knowledge graph management. Built with tRPC for type-safe client-server communication.

## Base URL
```
http://localhost:3000/api/trpc
```

## Authentication

Currently, the API uses basic authentication. Include the following header in requests:
```
Authorization: Bearer <your-api-key>
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:
- **Standard tier**: 100 requests per minute
- **Premium tier**: 1000 requests per minute
- **Enterprise tier**: Unlimited

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Error Handling

All errors follow the tRPC error format:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "data": {
      "code": "VALIDATION_ERROR",
      "httpStatus": 400,
      "path": "documents.ingest",
      "stack": "..."
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input parameters |
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `TIMEOUT` | 408 | Request timeout |
| `PAYLOAD_TOO_LARGE` | 413 | File or payload exceeds limits |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

## Documents API

### Ingest Document

Upload and process a new document.

**Endpoint**: `POST /documents.ingest`

**Request Body**:
```typescript
{
  title: string;
  content: string;
  source: 'upload' | 'scanner' | 'import' | 'api';
  metadata?: {
    author?: string;
    tags?: string[];
    category?: string;
    language?: string;
    [key: string]: any;
  };
  options?: {
    extractEntities?: boolean;
    generateEmbeddings?: boolean;
    buildRelationships?: boolean;
    encryptContent?: boolean;
  };
}
```

**Response**:
```typescript
{
  result: {
    data: {
      success: boolean;
      documentId: string;
      processingTime: number; // milliseconds
      document: {
        id: string;
        title: string;
        content: string;
        fileType: string;
        size: number;
        createdAt: string;
        metadata: object;
        extractedEntities: Entity[];
        language?: string;
      };
    }
  }
}
```

**Example**:
```bash
curl -X POST "http://localhost:3000/api/trpc/documents.ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "title": "Project Requirements",
    "content": "This document outlines the requirements for the new system...",
    "source": "upload",
    "metadata": {
      "author": "John Doe",
      "tags": ["requirements", "project"],
      "category": "documentation"
    },
    "options": {
      "extractEntities": true,
      "generateEmbeddings": true
    }
  }'
```

### Ingest File

Upload and process a file.

**Endpoint**: `POST /documents.ingestFile`

**Request**: Multipart form data
- `file`: File to upload (max 100MB)
- `metadata`: JSON string with document metadata
- `options`: JSON string with processing options

**Response**: Same as document ingest

**Example**:
```bash
curl -X POST "http://localhost:3000/api/trpc/documents.ingestFile" \
  -H "Authorization: Bearer <token>" \
  -F "file=@document.pdf" \
  -F 'metadata={"author":"John Doe","tags":["report"]}' \
  -F 'options={"extractEntities":true}'
```

### List Documents

Retrieve a list of documents with pagination and filtering.

**Endpoint**: `GET /documents.list`

**Query Parameters**:
```typescript
{
  limit?: number; // default: 20, max: 100
  offset?: number; // default: 0
  sortBy?: 'createdAt' | 'title' | 'size' | 'relevance';
  sortOrder?: 'asc' | 'desc'; // default: 'desc'
  filters?: {
    author?: string;
    category?: string;
    tags?: string[]; // AND operation
    fileType?: string;
    dateFrom?: string; // ISO date
    dateTo?: string; // ISO date
    minSize?: number; // bytes
    maxSize?: number; // bytes
  };
}
```

**Response**:
```typescript
{
  result: {
    data: {
      documents: Document[];
      pagination: {
        total: number;
        offset: number;
        limit: number;
        hasMore: boolean;
      };
    }
  }
}
```

### Get Document

Retrieve a specific document by ID.

**Endpoint**: `GET /documents.get`

**Query Parameters**:
```typescript
{
  id: string;
  includeContent?: boolean; // default: true
  includeEntities?: boolean; // default: true
  decrypt?: boolean; // default: true for encrypted docs
}
```

**Response**:
```typescript
{
  result: {
    data: {
      document: Document;
    }
  }
}
```

### Update Document

Update an existing document.

**Endpoint**: `PUT /documents.update`

**Request Body**:
```typescript
{
  id: string;
  title?: string;
  content?: string;
  metadata?: object;
  reprocessEntities?: boolean;
}
```

### Delete Document

Delete a document and all associated data.

**Endpoint**: `DELETE /documents.delete`

**Request Body**:
```typescript
{
  id: string;
  deleteRelationships?: boolean; // default: true
}
```

**Response**:
```typescript
{
  result: {
    data: {
      success: boolean;
      deletedRelationships: number;
    }
  }
}
```

### Batch Operations

Process multiple documents in a single request.

**Endpoint**: `POST /documents.ingestBatch`

**Request Body**:
```typescript
{
  documents: DocumentIngestRequest[];
  options?: {
    parallel?: boolean; // default: true
    stopOnError?: boolean; // default: false
  };
}
```

**Response**:
```typescript
{
  result: {
    data: {
      jobId: string;
      status: 'queued' | 'processing' | 'completed' | 'failed';
      totalDocuments: number;
    }
  }
}
```

## Search API

### Search Documents

Perform text search across all documents.

**Endpoint**: `GET /search.query`

**Query Parameters**:
```typescript
{
  q: string; // search query
  mode?: 'standard' | 'fuzzy' | 'semantic' | 'boolean' | 'wildcard';
  limit?: number; // default: 20, max: 100
  offset?: number; // default: 0
  sortBy?: 'relevance' | 'date' | 'title' | 'size';
  filters?: {
    author?: string;
    category?: string;
    tags?: string[];
    fileType?: string;
    dateFrom?: string;
    dateTo?: string;
    minScore?: number; // relevance threshold
  };
  highlight?: boolean; // default: true
  snippetLength?: number; // default: 200 characters
}
```

**Response**:
```typescript
{
  result: {
    data: {
      results: SearchResult[];
      pagination: {
        total: number;
        offset: number;
        limit: number;
        hasMore: boolean;
      };
      queryTime: number; // milliseconds
      suggestions?: string[]; // alternative query suggestions
    }
  }
}
```

**SearchResult Structure**:
```typescript
{
  documentId: string;
  title: string;
  snippet: string;
  score: number; // relevance score 0-1
  highlights: {
    title?: string[]; // highlighted terms
    content?: string[]; // highlighted terms
  };
  metadata: {
    author?: string;
    category?: string;
    fileType: string;
    size: number;
    createdAt: string;
  };
  matchPositions: {
    field: 'title' | 'content';
    start: number;
    end: number;
    term: string;
  }[];
}
```

### Search Suggestions

Get search query suggestions.

**Endpoint**: `GET /search.suggest`

**Query Parameters**:
```typescript
{
  q: string; // partial query
  limit?: number; // default: 10
}
```

**Response**:
```typescript
{
  result: {
    data: {
      suggestions: string[];
    }
  }
}
```

### Semantic Search

Perform semantic similarity search using embeddings.

**Endpoint**: `GET /search.semantic`

**Query Parameters**:
```typescript
{
  q: string;
  threshold?: number; // similarity threshold 0-1, default: 0.7
  limit?: number;
  includeScore?: boolean; // default: true
}
```

### Search Analytics

Get search analytics and metrics.

**Endpoint**: `GET /search.analytics`

**Query Parameters**:
```typescript
{
  dateFrom?: string;
  dateTo?: string;
  groupBy?: 'day' | 'week' | 'month';
}
```

**Response**:
```typescript
{
  result: {
    data: {
      totalQueries: number;
      uniqueQueries: number;
      averageResponseTime: number;
      topQueries: {
        query: string;
        count: number;
        averageResults: number;
      }[];
      noResultQueries: string[];
      queryTrends: {
        date: string;
        queries: number;
        uniqueUsers: number;
      }[];
    }
  }
}
```

## Entities API

### Extract Entities

Extract entities from text.

**Endpoint**: `POST /entities.extract`

**Request Body**:
```typescript
{
  text: string;
  types?: EntityType[]; // filter by entity types
  confidence?: number; // minimum confidence threshold
}
```

**EntityType**: `'person' | 'organization' | 'location' | 'date' | 'email' | 'phone' | 'url' | 'money'`

**Response**:
```typescript
{
  result: {
    data: {
      entities: Entity[];
      processingTime: number;
    }
  }
}
```

**Entity Structure**:
```typescript
{
  id: string;
  type: EntityType;
  text: string;
  confidence: number; // 0-1
  startOffset: number;
  endOffset: number;
  metadata?: {
    normalizedValue?: string;
    category?: string;
    [key: string]: any;
  };
}
```

### List Entities

Get all extracted entities with filtering.

**Endpoint**: `GET /entities.list`

**Query Parameters**:
```typescript
{
  type?: EntityType;
  documentId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'frequency' | 'confidence' | 'text';
  minConfidence?: number;
}
```

### Entity Relationships

Get relationships between entities.

**Endpoint**: `GET /entities.relationships`

**Query Parameters**:
```typescript
{
  entityId: string;
  relationshipTypes?: string[];
  maxDepth?: number; // default: 2
  minWeight?: number; // relationship strength threshold
}
```

## Graph API

### Get Graph Nodes

Retrieve knowledge graph nodes.

**Endpoint**: `GET /graph.nodes`

**Query Parameters**:
```typescript
{
  type?: 'document' | 'entity' | 'topic' | 'concept';
  limit?: number; // default: 100
  offset?: number;
  filters?: {
    category?: string;
    minWeight?: number;
    maxWeight?: number;
    createdAfter?: string;
  };
}
```

**Response**:
```typescript
{
  result: {
    data: {
      nodes: GraphNode[];
      totalCount: number;
    }
  }
}
```

**GraphNode Structure**:
```typescript
{
  id: string;
  label: string;
  type: 'document' | 'entity' | 'topic' | 'concept';
  properties: {
    weight: number; // importance score
    category?: string;
    description?: string;
    createdAt: string;
    [key: string]: any;
  };
  connections: number; // number of connected nodes
}
```

### Get Graph Edges

Retrieve relationships between nodes.

**Endpoint**: `GET /graph.edges`

**Query Parameters**:
```typescript
{
  sourceId?: string;
  targetId?: string;
  type?: string;
  limit?: number;
  minWeight?: number;
}
```

**Response**:
```typescript
{
  result: {
    data: {
      edges: GraphEdge[];
      totalCount: number;
    }
  }
}
```

**GraphEdge Structure**:
```typescript
{
  id: string;
  source: string; // source node ID
  target: string; // target node ID
  type: string; // relationship type
  weight: number; // relationship strength 0-1
  properties: {
    createdAt: string;
    source: string; // how relationship was discovered
    confidence: number;
    [key: string]: any;
  };
}
```

### Graph Traversal

Traverse the knowledge graph from a starting node.

**Endpoint**: `GET /graph.traverse`

**Query Parameters**:
```typescript
{
  startNodeId: string;
  maxDepth?: number; // default: 3
  relationshipTypes?: string[]; // filter by edge types
  nodeTypes?: string[]; // filter by node types
  minWeight?: number; // minimum relationship weight
  algorithm?: 'breadth-first' | 'depth-first' | 'shortest-path';
}
```

**Response**:
```typescript
{
  result: {
    data: {
      paths: {
        nodes: GraphNode[];
        edges: GraphEdge[];
        totalWeight: number;
        depth: number;
      }[];
      summary: {
        nodesVisited: number;
        edgesTraversed: number;
        maxDepthReached: number;
      };
    }
  }
}
```

### Graph Statistics

Get graph analytics and statistics.

**Endpoint**: `GET /graph.stats`

**Response**:
```typescript
{
  result: {
    data: {
      totalNodes: number;
      totalEdges: number;
      nodesByType: Record<string, number>;
      edgesByType: Record<string, number>;
      averageConnections: number;
      density: number; // graph density 0-1
      clusters: {
        id: string;
        size: number;
        density: number;
        topNodes: string[]; // most central nodes
      }[];
      centrality: {
        nodeId: string;
        betweenness: number;
        closeness: number;
        degree: number;
      }[];
    }
  }
}
```

## Jobs API

### Get Job Status

Check the status of a background job.

**Endpoint**: `GET /jobs.status`

**Query Parameters**:
```typescript
{
  id: string; // job ID
}
```

**Response**:
```typescript
{
  result: {
    data: {
      id: string;
      status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
      progress: number; // 0-100
      startedAt?: string;
      completedAt?: string;
      result?: any; // job result if completed
      error?: string; // error message if failed
      metadata: {
        type: string; // job type
        priority: number;
        attempts: number;
        maxAttempts: number;
      };
    }
  }
}
```

### List Jobs

Get a list of jobs with filtering.

**Endpoint**: `GET /jobs.list`

**Query Parameters**:
```typescript
{
  status?: JobStatus[];
  type?: string;
  limit?: number;
  offset?: number;
  userId?: string;
}
```

### Cancel Job

Cancel a queued or running job.

**Endpoint**: `POST /jobs.cancel`

**Request Body**:
```typescript
{
  id: string;
  reason?: string;
}
```

## Health and Monitoring

### Health Check

Check API health and service status.

**Endpoint**: `GET /health`

**Response**:
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number; // seconds
  services: {
    database: 'connected' | 'disconnected' | 'error';
    redis: 'connected' | 'disconnected' | 'error';
    neo4j: 'connected' | 'disconnected' | 'error';
    search: 'ready' | 'indexing' | 'error';
  };
  metrics: {
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
    memoryUsage: number; // MB
    diskUsage: number; // MB
  };
}
```

### System Metrics

Get detailed system metrics.

**Endpoint**: `GET /metrics`

**Response**: Prometheus-format metrics for monitoring systems.

## WebSocket Events

The API supports real-time updates via WebSocket connections.

### Connection

Connect to: `ws://localhost:3000/api/ws`

### Authentication

Send authentication message after connection:
```json
{
  "type": "auth",
  "token": "your-api-token"
}
```

### Event Types

#### Document Events
```json
{
  "type": "document.ingested",
  "data": {
    "documentId": "string",
    "title": "string",
    "processingTime": "number"
  }
}
```

```json
{
  "type": "document.updated",
  "data": {
    "documentId": "string",
    "changes": ["title", "metadata"]
  }
}
```

#### Search Events
```json
{
  "type": "search.completed",
  "data": {
    "query": "string",
    "resultCount": "number",
    "responseTime": "number"
  }
}
```

#### Graph Events
```json
{
  "type": "graph.updated",
  "data": {
    "nodeId": "string",
    "changeType": "created" | "updated" | "deleted",
    "affectedConnections": "number"
  }
}
```

## SDK and Client Libraries

### Official SDKs

- **JavaScript/TypeScript**: `@autoorganize/client`
- **Python**: `autoorganize-python`
- **Rust**: `autoorganize-rust`

### Installation

```bash
npm install @autoorganize/client
pip install autoorganize-python
cargo add autoorganize-rust
```

### Basic Usage

```typescript
import { AutoOrganizeClient } from '@autoorganize/client';

const client = new AutoOrganizeClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// Ingest a document
const result = await client.documents.ingest({
  title: 'My Document',
  content: 'Document content...',
  source: 'api'
});

// Search documents
const searchResults = await client.search.query({
  q: 'search terms',
  limit: 10
});

// Get graph data
const graphNodes = await client.graph.nodes({
  type: 'document',
  limit: 50
});
```

## Rate Limits and Quotas

| Resource | Limit | Window |
|----------|-------|---------|
| Document Ingestion | 100 documents | 1 hour |
| Search Queries | 1000 queries | 1 hour |
| File Uploads | 1 GB | 1 day |
| Graph Queries | 500 queries | 1 hour |
| WebSocket Connections | 10 concurrent | - |

## Changelog

### v0.1.0 (Current)
- Initial API release
- Document ingestion and search
- Entity extraction
- Knowledge graph
- WebSocket support
- Basic authentication

### Planned Features
- OAuth 2.0 authentication
- Advanced NLP features
- Real-time collaboration
- Plugin system
- GraphQL endpoint
- Mobile SDK