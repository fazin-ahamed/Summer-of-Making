import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { SearchService } from '../services/search';
import { TRPCError } from '@trpc/server';

// Input validation schemas
const searchRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  type: z.enum(['fulltext', 'semantic', 'fuzzy', 'hybrid']).default('hybrid'),
  filters: z.object({
    fileTypes: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    }).optional(),
    tags: z.array(z.string()).optional(),
    minScore: z.number().min(0).max(1).optional(),
  }).optional(),
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
  }).optional(),
  sortBy: z.enum(['relevance', 'date', 'title']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const similaritySearchSchema = z.object({
  documentId: z.string().uuid(),
  threshold: z.number().min(0).max(1).default(0.7),
  maxResults: z.number().min(1).max(50).default(10),
});

const autoCompleteSchema = z.object({
  query: z.string().min(1),
  maxSuggestions: z.number().min(1).max(20).default(10),
});

const searchHistorySchema = z.object({
  userId: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

// Initialize search service
const searchService = new SearchService();

// Initialize the service immediately
searchService.initialize().catch(error => {
  console.error('Failed to initialize search service:', error);
});

export const searchRouter = router({
  // Full-text and semantic search
  search: publicProcedure
    .input(searchRequestSchema)
    .query(async ({ input }) => {
      try {
        const results = await searchService.performSearch(input);
        return {
          success: true,
          data: results,
          pagination: {
            page: input.pagination?.page || 1,
            limit: input.pagination?.limit || 20,
            total: results.totalCount,
            totalPages: Math.ceil(results.totalCount / (input.pagination?.limit || 20)),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Similar document search
  findSimilar: publicProcedure
    .input(similaritySearchSchema)
    .query(async ({ input }) => {
      try {
        const similarDocuments = await searchService.findSimilarDocuments(
          input.documentId,
          input.threshold,
          input.maxResults
        );
        return {
          success: true,
          data: similarDocuments,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Auto-complete suggestions
  autoComplete: publicProcedure
    .input(autoCompleteSchema)
    .query(async ({ input }) => {
      try {
        const suggestions = await searchService.getAutoCompleteSuggestions(
          input.query,
          input.maxSuggestions
        );
        return {
          success: true,
          data: suggestions,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Auto-complete failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Search history
  getSearchHistory: publicProcedure
    .input(searchHistorySchema)
    .query(async ({ input }) => {
      try {
        const history = await searchService.getSearchHistory(
          input.userId,
          input.limit
        );
        return {
          success: true,
          data: history,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve search history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Clear search history
  clearSearchHistory: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        await searchService.clearSearchHistory(input.userId);
        return {
          success: true,
          message: 'Search history cleared successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to clear search history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get search statistics
  getSearchStats: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
      timeRange: z.enum(['day', 'week', 'month', 'year']).default('month'),
    }))
    .query(async ({ input }) => {
      try {
        const stats = await searchService.getSearchStatistics(
          input.userId,
          input.timeRange
        );
        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve search statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Advanced search with complex filters
  advancedSearch: publicProcedure
    .input(z.object({
      filters: z.object({
        fullTextQuery: z.string().optional(),
        semanticQuery: z.string().optional(),
        entityFilters: z.array(z.object({
          type: z.string(),
          value: z.string(),
        })).optional(),
        contentType: z.array(z.string()).optional(),
        fileSize: z.object({
          min: z.number().optional(),
          max: z.number().optional(),
        }).optional(),
        createdDate: z.object({
          start: z.string().datetime().optional(),
          end: z.string().datetime().optional(),
        }).optional(),
        modifiedDate: z.object({
          start: z.string().datetime().optional(),
          end: z.string().datetime().optional(),
        }).optional(),
      }),
      pagination: z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }).optional(),
      sortBy: z.enum(['relevance', 'date', 'title', 'size']).default('relevance'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }))
    .query(async ({ input }) => {
      try {
        const results = await searchService.performAdvancedSearch(input);
        return {
          success: true,
          data: results,
          pagination: {
            page: input.pagination?.page || 1,
            limit: input.pagination?.limit || 20,
            total: results.totalCount,
            totalPages: Math.ceil(results.totalCount / (input.pagination?.limit || 20)),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Advanced search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // Get trending search terms
  getTrendingTerms: publicProcedure
    .input(z.object({
      timeRange: z.enum(['day', 'week', 'month']).default('week'),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      try {
        const trendingTerms = await searchService.getTrendingSearchTerms(
          input.timeRange,
          input.limit
        );
        return {
          success: true,
          data: trendingTerms,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to retrieve trending terms: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),
});