import { z } from 'zod';
import { initTRPC, TRPCError } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { 
  DocumentInfo, 
  Entity, 
  SearchResult, 
  IngestionConfig,
  SearchQuery,
  GraphRelationship,
  ApiResponse 
} from '@autoorganize/types';
import { searchRouter as searchRouterImpl } from './routes/search';
import { ingestionRouter } from './routes/ingestion';
import { entityRouter as entityRouterImpl } from './routes/entity';
import { graphRouter as graphRouterImpl } from './routes/graph';

// Context definition
export interface Context {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  requestId: string;
  ip: string;
  userAgent?: string;
}

export const createContext = ({ req }: CreateExpressContextOptions): Context => {
  return {
    user: req.user as Context['user'], // Assuming auth middleware adds user
    requestId: req.headers['x-request-id'] as string || Math.random().toString(36),
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'],
  };
};

// Initialize tRPC
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.code === 'BAD_REQUEST' && error.cause instanceof z.ZodError 
          ? error.cause.flatten() 
          : null,
      },
    };
  },
});

// Base router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;

// Auth middleware
const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this endpoint',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);

// Validation schemas
const documentSchema = z.object({
  id: z.string(),
  source_type: z.string(),
  file_path: z.string(),
  content_hash: z.string(),
  ingested_at: z.number(),
  modified_at: z.number(),
  metadata_json: z.string(),
  title: z.string(),
  content: z.string().optional(),
});

const entitySchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  properties: z.record(z.any()),
  created_at: z.date(),
  confidence: z.number().optional(),
});

const searchQuerySchema = z.object({
  text: z.string(),
  filters: z.object({
    entity_types: z.array(z.string()).optional(),
    document_types: z.array(z.string()).optional(),
    date_range: z.object({
      start: z.date().optional(),
      end: z.date().optional(),
    }).optional(),
    file_types: z.array(z.string()).optional(),
    source_types: z.array(z.string()).optional(),
  }),
  options: z.object({
    limit: z.number().optional(),
    offset: z.number().optional(),
    include_snippets: z.boolean().default(true),
    highlight_matches: z.boolean().default(true),
    fuzzy_matching: z.boolean().default(false),
    semantic_search: z.boolean().default(false),
    boost_recent: z.boolean().default(true),
  }),
});

const paginationSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

// Document-related procedures
export const documentRouter = router({
  // Get document by ID
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      // TODO: Implement database call
      console.log(`Getting document ${input.id} for request ${ctx.requestId}`);
      return null as DocumentInfo | null;
    }),

  // List documents with pagination
  list: publicProcedure
    .input(paginationSchema.extend({
      source_type: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      // TODO: Implement database call
      console.log(`Listing documents with params:`, input);
      return {
        documents: [] as DocumentInfo[],
        total: 0,
        hasMore: false,
      };
    }),

  // Ingest a new document
  ingest: protectedProcedure
    .input(z.object({
      file_path: z.string(),
      source_type: z.string(),
      extract_entities: z.boolean().default(true),
      build_relationships: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      // TODO: Implement ingestion
      console.log(`Ingesting document: ${input.file_path}`);
      return {
        success: true,
        document_id: 'generated-id',
        message: 'Document ingestion started',
      };
    }),

  // Delete document
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // TODO: Implement deletion
      console.log(`Deleting document ${input.id}`);
      return { success: true };
    }),

  // Get document statistics
  stats: publicProcedure
    .query(async ({ ctx }) => {
      // TODO: Implement stats
      return {
        total_documents: 0,
        total_size: 0,
        by_type: {} as Record<string, number>,
        recent_count: 0,
      };
    }),
});

// Use the comprehensive search router implementation
export const searchRouter = searchRouterImpl;

// Use the comprehensive entity router implementation
export const entityRouter = entityRouterImpl;

// Use the comprehensive graph router implementation
export const graphRouter = graphRouterImpl;

// System-related procedures
export const systemRouter = router({
  // Health check
  health: publicProcedure
    .query(async ({ ctx }) => {
      // TODO: Check all system components
      return {
        status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
        timestamp: new Date().toISOString(),
        components: {
          database: 'healthy',
          search_engine: 'healthy',
          file_system: 'healthy',
          rust_core: 'healthy',
        },
        version: process.env.npm_package_version || '0.1.0',
      };
    }),

  // Get system information
  info: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        version: process.env.npm_package_version || '0.1.0',
        node_version: process.version,
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        platform: process.platform,
        environment: process.env.NODE_ENV || 'development',
      };
    }),

  // Get configuration
  config: protectedProcedure
    .query(async ({ ctx }) => {
      // TODO: Return safe configuration values
      return {
        features: {
          encryption: false,
          semantic_search: false,
          ocr: false,
        },
        limits: {
          max_file_size: 100 * 1024 * 1024, // 100MB
          max_upload_files: 10,
          rate_limit: 1000, // requests per hour
        },
      };
    }),
});

// Main application router
export const appRouter = router({
  documents: documentRouter,
  search: searchRouter,
  ingestion: ingestionRouter,
  entities: entityRouter,
  graph: graphRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;