// Core data types for AutoOrganize system

export interface DocumentInfo {
  id: string;
  source_type: DataSourceType;
  file_path: string;
  content_hash: string;
  ingested_at: Date;
  modified_at: Date;
  metadata: Record<string, any>;
  title: string;
  content?: string;
  entities: Entity[];
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  embedding?: number[];
}

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, any>;
  created_at: Date;
  confidence?: number;
}

export interface EntityMention {
  entity_id: string;
  document_id: string;
  start_position: number;
  end_position: number;
  confidence: number;
}

export interface SearchResult {
  id: string;
  type: 'document' | 'entity' | 'relationship';
  title: string;
  snippet: string;
  relevance_score: number;
  source: DataSource;
  metadata: Record<string, any>;
}

export interface FileEvent {
  event_type: 'created' | 'modified' | 'deleted' | 'renamed';
  file_path: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface SyncEvent {
  id: string;
  event_type: 'file_changed' | 'document_ingested' | 'entity_extracted' | 'sync_completed';
  timestamp: Date;
  data: Record<string, any>;
}

// Enums and constants
export enum DataSourceType {
  FILE_SYSTEM = 'file_system',
  EMAIL = 'email',
  CLOUD_STORAGE = 'cloud_storage',
  DEVELOPMENT_TOOLS = 'development_tools',
  COMMUNICATION = 'communication',
  BROWSER = 'browser',
}

export enum EntityType {
  PERSON = 'person',
  ORGANIZATION = 'organization',
  LOCATION = 'location',
  DATE = 'date',
  FINANCIAL = 'financial',
  TECHNICAL = 'technical',
  PROJECT = 'project',
  CUSTOM = 'custom',
}

export interface DataSource {
  type: DataSourceType;
  name: string;
  config: Record<string, any>;
  enabled: boolean;
  last_sync?: Date;
}

export interface GraphRelationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  strength: number;
  properties: Record<string, any>;
  created_at: Date;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface SearchFilter {
  entity_types?: EntityType[];
  data_sources?: DataSourceType[];
  time_range?: TimeRange;
  content_types?: string[];
}

export interface IngestionConfig {
  watch_paths: string[];
  file_patterns: string[];
  exclude_patterns: string[];
  auto_extract_entities: boolean;
  auto_build_relationships: boolean;
}

export interface EncryptionConfig {
  enabled: boolean;
  algorithm: string;
  key_derivation: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

// FFI interface types for Rust integration
export interface RustCoreConfig {
  db_path: string;
  encryption_config?: EncryptionConfig;
  ingestion_config: IngestionConfig;
}

export interface FFICallback<T> {
  (result: T): void;
}

// Mobile app specific types
export interface DocumentScanResult {
  image_path: string;
  text_content?: string;
  confidence_score?: number;
  detected_entities?: Entity[];
}

export interface NotificationConfig {
  sync_events: boolean;
  entity_discoveries: boolean;
  relationship_insights: boolean;
}

// Desktop app specific types
export interface WindowConfig {
  width: number;
  height: number;
  x?: number;
  y?: number;
  minimized?: boolean;
  maximized?: boolean;
}

export interface GraphVisualizationConfig {
  layout: 'force' | 'hierarchical' | 'circular';
  node_size_metric: 'connections' | 'importance' | 'frequency';
  edge_thickness_metric: 'strength' | 'frequency';
  show_labels: boolean;
  max_nodes: number;
}

// API endpoint types
export interface IngestDocumentRequest {
  file_path: string;
  source_type: DataSourceType;
  extract_entities?: boolean;
  build_relationships?: boolean;
}

export interface SearchDocumentsRequest {
  query: string;
  filters?: SearchFilter;
  limit?: number;
  offset?: number;
}

export interface GetEntitiesRequest {
  types?: EntityType[];
  limit?: number;
  offset?: number;
  search?: string;
}

export interface GetRelationshipsRequest {
  entity_id?: string;
  relationship_types?: string[];
  min_strength?: number;
  limit?: number;
}

// Error types
export class AutoOrganizeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AutoOrganizeError';
  }
}

export class FFIError extends AutoOrganizeError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'FFI_ERROR', details);
    this.name = 'FFIError';
  }
}

export class IngestionError extends AutoOrganizeError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'INGESTION_ERROR', details);
    this.name = 'IngestionError';
  }
}

export class SearchError extends AutoOrganizeError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'SEARCH_ERROR', details);
    this.name = 'SearchError';
  }
}