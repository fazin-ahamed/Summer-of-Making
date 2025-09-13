import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { GraphService } from '../services/graph';
import { TRPCError } from '@trpc/server';

// Input validation schemas
const pathFindingSchema = z.object({
  sourceId: z.string().uuid('Invalid source entity ID'),
  targetId: z.string().uuid('Invalid target entity ID'),
  maxDepth: z.number().min(1).max(10).default(5),
  relationshipTypes: z.array(z.string()).optional(),
  algorithm: z.enum(['shortest', 'all', 'weighted']).default('shortest'),
});

const neighborhoodSchema = z.object({
  entityId: z.string().uuid('Invalid entity ID'),
  depth: z.number().min(1).max(3).default(1),
  direction: z.enum(['in', 'out', 'both']).default('both'),
  relationshipTypes: z.array(z.string()).optional(),
  limit: z.number().min(1).max(1000).default(100),
  includeProperties: z.boolean().default(true),
});

const centralitySchema = z.object({
  algorithm: z.enum(['betweenness', 'closeness', 'degree', 'pagerank']).default('degree'),
  limit: z.number().min(1).max(100).default(10),
  entityTypes: z.array(z.string()).optional(),
  relationshipTypes: z.array(z.string()).optional(),
});

const communityDetectionSchema = z.object({
  algorithm: z.enum(['louvain', 'label_propagation', 'connected_components']).default('louvain'),
  minCommunitySize: z.number().min(2).default(3),
  maxCommunities: z.number().min(1).max(100).default(20),
  relationshipTypes: z.array(z.string()).optional(),
});

const graphQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  parameters: z.record(z.any()).optional(),
  includeStats: z.boolean().default(false),
  limit: z.number().min(1).max(1000).default(100),
});

const relationshipCreateSchema = z.object({
  sourceId: z.string().uuid('Invalid source entity ID'),
  targetId: z.string().uuid('Invalid target entity ID'),
  type: z.string().min(1, 'Relationship type is required'),
  properties: z.record(z.any()).optional().default({}),
  strength: z.number().min(0).max(1).default(1.0),
  bidirectional: z.boolean().default(false),
});

const relationshipUpdateSchema = z.object({
  id: z.string().uuid('Invalid relationship ID'),
  type: z.string().optional(),
  properties: z.record(z.any()).optional(),
  strength: z.number().min(0).max(1).optional(),
});

const graphAnalyticsSchema = z.object({
  timeRange: z.enum(['day', 'week', 'month', 'year']).default('month'),
  metrics: z.array(z.enum(['density', 'clustering', 'diameter', 'components'])).default(['density']),
  entityTypes: z.array(z.string()).optional(),
  relationshipTypes: z.array(z.string()).optional(),
});

const subgraphSchema = z.object({
  entityIds: z.array(z.string().uuid()).min(1, 'At least one entity ID is required'),
  includeNeighbors: z.boolean().default(false),
  maxDepth: z.number().min(1).max(3).default(1),
  relationshipTypes: z.array(z.string()).optional(),
});

// Initialize graph service
const graphService = new GraphService();

// Initialize the service immediately
graphService.initialize().catch(error => {
  console.error('Failed to initialize graph service:', error);
});

export const graphRouter = router({
  // Get knowledge graph data for visualization
  getKnowledgeGraph: publicProcedure
    .input(z.object({
      centerNodeId: z.string().optional(),
      depth: z.number().min(1).max(5).default(2),
      minWeight: z.number().min(0).max(1).default(0.1),
      maxNodes: z.number().min(10).max(500).default(100),
      entityTypes: z.array(z.string()).optional(),
      relationshipTypes: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      try {
        const graphData = await graphService.getKnowledgeGraph(input);
        return {
          success: true,
          data: graphData,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve knowledge graph: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get graph statistics
  getGraphStatistics: publicProcedure
    .query(async () => {
      try {
        const stats = await graphService.getGraphStatistics();
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve graph statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Find shortest path between entities
  findPath: publicProcedure
    .input(pathFindingSchema)
    .query(async ({ input }) => {
      try {
        const paths = await graphService.findPaths(input);
        return {
          success: true,
          data: paths,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Path finding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get entity neighborhood
  getNeighborhood: publicProcedure
    .input(neighborhoodSchema)
    .query(async ({ input }) => {
      try {
        const neighborhood = await graphService.getNeighborhood(input);
        return {
          success: true,
          data: neighborhood,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve neighborhood: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get most connected entities (centrality analysis)
  getCentralNodes: publicProcedure
    .input(centralitySchema)
    .query(async ({ input }) => {
      try {
        const centralNodes = await graphService.calculateCentrality(input);
        return {
          success: true,
          data: centralNodes,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Centrality calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Detect communities in the graph
  detectCommunities: publicProcedure
    .input(communityDetectionSchema)
    .query(async ({ input }) => {
      try {
        const communities = await graphService.detectCommunities(input);
        return {
          success: true,
          data: communities,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Community detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Execute custom graph query (Cypher for Neo4j)
  executeQuery: protectedProcedure
    .input(graphQuerySchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Validate and sanitize query for security
        const result = await graphService.executeCustomQuery(input, ctx.user?.id);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Create a new relationship
  createRelationship: protectedProcedure
    .input(relationshipCreateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const relationship = await graphService.createRelationship(input, ctx.user?.id);
        return {
          success: true,
          data: relationship,
          message: 'Relationship created successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create relationship: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Update an existing relationship
  updateRelationship: protectedProcedure
    .input(relationshipUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const relationship = await graphService.updateRelationship(input, ctx.user?.id);
        if (!relationship) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Relationship with ID ${input.id} not found`,
          });
        }
        return {
          success: true,
          data: relationship,
          message: 'Relationship updated successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update relationship: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Delete a relationship
  deleteRelationship: protectedProcedure
    .input(z.object({
      id: z.string().uuid('Invalid relationship ID'),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const success = await graphService.deleteRelationship(input.id, ctx.user?.id);
        if (!success) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Relationship with ID ${input.id} not found`,
          });
        }
        return {
          success: true,
          message: 'Relationship deleted successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete relationship: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get subgraph
  getSubgraph: publicProcedure
    .input(subgraphSchema)
    .query(async ({ input }) => {
      try {
        const subgraph = await graphService.getSubgraph(input);
        return {
          success: true,
          data: subgraph,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve subgraph: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get graph analytics
  getAnalytics: publicProcedure
    .input(graphAnalyticsSchema)
    .query(async ({ input }) => {
      try {
        const analytics = await graphService.getGraphAnalytics(input);
        return {
          success: true,
          data: analytics,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve graph analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get relationship types with counts
  getRelationshipTypes: publicProcedure
    .query(async () => {
      try {
        const types = await graphService.getRelationshipTypes();
        return {
          success: true,
          data: types,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve relationship types: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Suggest new relationships based on patterns
  suggestRelationships: publicProcedure
    .input(z.object({
      entityId: z.string().uuid('Invalid entity ID'),
      algorithm: z.enum(['collaborative_filtering', 'similarity', 'pattern_based']).default('similarity'),
      limit: z.number().min(1).max(50).default(10),
      minConfidence: z.number().min(0).max(1).default(0.5),
    }))
    .query(async ({ input }) => {
      try {
        const suggestions = await graphService.suggestRelationships(input);
        return {
          success: true,
          data: suggestions,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to generate relationship suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Export graph data
  export: protectedProcedure
    .input(z.object({
      format: z.enum(['graphml', 'gexf', 'json', 'cypher']).default('json'),
      filters: z.object({
        entityTypes: z.array(z.string()).optional(),
        relationshipTypes: z.array(z.string()).optional(),
        includeProperties: z.boolean().default(true),
        maxNodes: z.number().min(1).max(10000).default(1000),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const exportData = await graphService.exportGraph(input, ctx.user?.id);
        return {
          success: true,
          data: exportData,
          message: 'Graph exported successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Graph export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Import graph data
  import: protectedProcedure
    .input(z.object({
      format: z.enum(['graphml', 'gexf', 'json', 'cypher']),
      data: z.string().min(1, 'Import data cannot be empty'),
      options: z.object({
        merge: z.boolean().default(true),
        validateEntities: z.boolean().default(true),
        createMissingEntities: z.boolean().default(false),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await graphService.importGraph(input, ctx.user?.id);
        return {
          success: true,
          data: result,
          message: 'Graph imported successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Graph import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Optimize graph structure
  optimize: protectedProcedure
    .input(z.object({
      operations: z.array(z.enum(['remove_duplicates', 'merge_similar', 'prune_weak', 'reindex'])).default(['remove_duplicates']),
      threshold: z.number().min(0).max(1).default(0.8),
      dryRun: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await graphService.optimizeGraph(input, ctx.user?.id);
        return {
          success: true,
          data: result,
          message: input.dryRun ? 'Graph optimization simulation completed' : 'Graph optimized successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Graph optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),
});