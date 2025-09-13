import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { EntityService } from '../services/entity';
import { TRPCError } from '@trpc/server';

// Input validation schemas
const entityCreateSchema = z.object({
  type: z.string().min(1, 'Entity type is required'),
  name: z.string().min(1, 'Entity name is required'),
  properties: z.record(z.any()).optional().default({}),
  confidence: z.number().min(0).max(1).optional(),
});

const entityUpdateSchema = entityCreateSchema.partial().extend({
  id: z.string().uuid('Invalid entity ID'),
});

const entityQuerySchema = z.object({
  id: z.string().uuid('Invalid entity ID'),
});

const entityListSchema = z.object({
  type: z.string().optional(),
  search: z.string().optional(),
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
  }).optional(),
  sortBy: z.enum(['name', 'type', 'created_at', 'confidence']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const entityRelationsSchema = z.object({
  id: z.string().uuid('Invalid entity ID'),
  relationshipTypes: z.array(z.string()).optional(),
  maxDepth: z.number().min(1).max(5).default(1),
  limit: z.number().min(1).max(100).default(20),
  includeProperties: z.boolean().default(true),
});

const entityMentionsSchema = z.object({
  id: z.string().uuid('Invalid entity ID'),
  documentIds: z.array(z.string().uuid()).optional(),
  limit: z.number().min(1).max(100).default(50),
  includeContext: z.boolean().default(true),
});

const bulkEntityOperationSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  entities: z.array(z.union([
    entityCreateSchema,
    entityUpdateSchema,
    z.object({ id: z.string().uuid() })
  ])),
});

const entityMergeSchema = z.object({
  sourceId: z.string().uuid('Invalid source entity ID'),
  targetId: z.string().uuid('Invalid target entity ID'),
  mergeStrategy: z.enum(['prefer_source', 'prefer_target', 'merge_properties']).default('merge_properties'),
});

// Initialize entity service
const entityService = new EntityService();

// Initialize the service immediately
entityService.initialize().catch(error => {
  console.error('Failed to initialize entity service:', error);
});

export const entityRouter = router({
  // Get entity by ID
  getById: publicProcedure
    .input(entityQuerySchema)
    .query(async ({ input }) => {
      try {
        const entity = await entityService.getEntityById(input.id);
        if (!entity) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Entity with ID ${input.id} not found`,
          });
        }
        return {
          success: true,
          data: entity,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve entity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // List entities with filtering and pagination
  list: publicProcedure
    .input(entityListSchema)
    .query(async ({ input }) => {
      try {
        const result = await entityService.listEntities(input);
        return {
          success: true,
          data: result.entities,
          pagination: {
            page: input.pagination?.page || 1,
            limit: input.pagination?.limit || 20,
            total: result.total,
            totalPages: Math.ceil(result.total / (input.pagination?.limit || 20)),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list entities: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get entity types with counts
  getTypes: publicProcedure
    .query(async () => {
      try {
        const types = await entityService.getEntityTypes();
        return {
          success: true,
          data: types,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve entity types: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get related entities
  getRelated: publicProcedure
    .input(entityRelationsSchema)
    .query(async ({ input }) => {
      try {
        const result = await entityService.getRelatedEntities(input);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve related entities: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get entity mentions in documents
  getMentions: publicProcedure
    .input(entityMentionsSchema)
    .query(async ({ input }) => {
      try {
        const mentions = await entityService.getEntityMentions(input);
        return {
          success: true,
          data: mentions,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve entity mentions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Create a new entity
  create: protectedProcedure
    .input(entityCreateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const entity = await entityService.createEntity(input, ctx.user?.id);
        return {
          success: true,
          data: entity,
          message: 'Entity created successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create entity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Update an existing entity
  update: protectedProcedure
    .input(entityUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const entity = await entityService.updateEntity(input, ctx.user?.id);
        if (!entity) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Entity with ID ${input.id} not found`,
          });
        }
        return {
          success: true,
          data: entity,
          message: 'Entity updated successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update entity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Delete an entity
  delete: protectedProcedure
    .input(entityQuerySchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const success = await entityService.deleteEntity(input.id, ctx.user?.id);
        if (!success) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Entity with ID ${input.id} not found`,
          });
        }
        return {
          success: true,
          message: 'Entity deleted successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete entity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Bulk operations on entities
  bulkOperation: protectedProcedure
    .input(bulkEntityOperationSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await entityService.bulkEntityOperation(input, ctx.user?.id);
        return {
          success: true,
          data: result,
          message: `Bulk ${input.operation} operation completed`,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Bulk operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Merge two entities
  merge: protectedProcedure
    .input(entityMergeSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const mergedEntity = await entityService.mergeEntities(input, ctx.user?.id);
        return {
          success: true,
          data: mergedEntity,
          message: 'Entities merged successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to merge entities: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Search entities by name or properties
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1, 'Search query cannot be empty'),
      type: z.string().optional(),
      properties: z.record(z.any()).optional(),
      limit: z.number().min(1).max(100).default(20),
      includeRelations: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      try {
        const results = await entityService.searchEntities(input);
        return {
          success: true,
          data: results,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Entity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get entity statistics
  getStatistics: publicProcedure
    .input(z.object({
      timeRange: z.enum(['day', 'week', 'month', 'year']).default('month'),
      groupBy: z.enum(['type', 'confidence', 'creation_date']).default('type'),
    }))
    .query(async ({ input }) => {
      try {
        const stats = await entityService.getEntityStatistics(input);
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve entity statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Validate entity data
  validate: publicProcedure
    .input(z.object({
      entities: z.array(z.object({
        type: z.string(),
        name: z.string(),
        properties: z.record(z.any()).optional(),
      })),
    }))
    .query(async ({ input }) => {
      try {
        const validationResults = await entityService.validateEntities(input.entities);
        return {
          success: true,
          data: validationResults,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Entity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Export entities
  export: protectedProcedure
    .input(z.object({
      format: z.enum(['json', 'csv', 'rdf']).default('json'),
      filters: z.object({
        types: z.array(z.string()).optional(),
        createdAfter: z.string().datetime().optional(),
        includeRelations: z.boolean().default(true),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const exportData = await entityService.exportEntities(input, ctx.user?.id);
        return {
          success: true,
          data: exportData,
          message: 'Entities exported successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),
});