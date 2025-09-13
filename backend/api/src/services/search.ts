import { EventEmitter } from 'events';
import { DatabaseManager } from '../../database';
import { SearchEngine } from '../mock/search-engine';
import { v4 as uuidv4 } from 'uuid';

// Type definitions for search functionality
export interface SearchRequest {
  query: string;
  type: 'fulltext' | 'semantic' | 'fuzzy' | 'hybrid';
  filters?: {
    fileTypes?: string[];
    dateRange?: {
      start?: string;
      end?: string;
    };
    tags?: string[];
    minScore?: number;
  };
  pagination?: {
    page: number;
    limit: number;
  };
  sortBy: 'relevance' | 'date' | 'title';
  sortOrder: 'asc' | 'desc';
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  snippet: string;
  score: number;
  filePath: string;
  fileType: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  tags: string[];
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  highlights: Array<{
    field: string;
    fragments: string[];
  }>;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  searchTime: number;
  facets: {
    fileTypes: Array<{ type: string; count: number }>;
    tags: Array<{ tag: string; count: number }>;
    dateRanges: Array<{ range: string; count: number }>;
  };
}

export interface SimilarDocument {
  id: string;
  title: string;
  filePath: string;
  similarity: number;
  snippet: string;
}

export interface AutoCompleteSuggestion {
  text: string;
  type: 'query' | 'entity' | 'tag';
  frequency: number;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  type: string;
  timestamp: string;
  resultCount: number;
  userId?: string;
}

export interface SearchStats {
  totalSearches: number;
  avgResultsPerSearch: number;
  topQueries: Array<{ query: string; count: number }>;
  searchFrequency: Array<{ date: string; count: number }>;
}

export interface AdvancedSearchRequest {
  filters: {
    fullTextQuery?: string;
    semanticQuery?: string;
    entityFilters?: Array<{
      type: string;
      value: string;
    }>;
    contentType?: string[];
    fileSize?: {
      min?: number;
      max?: number;
    };
    createdDate?: {
      start?: string;
      end?: string;
    };
    modifiedDate?: {
      start?: string;
      end?: string;
    };
  };
  pagination?: {
    page: number;
    limit: number;
  };
  sortBy: 'relevance' | 'date' | 'title' | 'size';
  sortOrder: 'asc' | 'desc';
}

export interface TrendingTerm {
  term: string;
  count: number;
  trend: 'rising' | 'stable' | 'falling';
  percentage: number;
}

export class SearchService extends EventEmitter {
  private dbManager: DatabaseManager;
  private searchEngine: SearchEngine;

  constructor() {
    super();
    this.dbManager = new DatabaseManager();
    this.searchEngine = new SearchEngine();
  }

  async initialize(): Promise<void> {
    try {
      await this.dbManager.initialize();
      // Initialize search engine with database connections
      await this.searchEngine.initialize({
        sqliteConnection: this.dbManager.getSQLiteConnection(),
        rocksdbPath: process.env.ROCKSDB_PATH || './data/rocksdb',
        neo4jConfig: {
          uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
          username: process.env.NEO4J_USERNAME || 'neo4j',
          password: process.env.NEO4J_PASSWORD || 'password',
        },
      });
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async performSearch(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    
    try {
      // Record search in history
      await this.recordSearchHistory(request);

      // Execute search based on type
      let results: SearchResult[];
      
      switch (request.type) {
        case 'fulltext':
          results = await this.executeFullTextSearch(request);
          break;
        case 'semantic':
          results = await this.executeSemanticSearch(request);
          break;
        case 'fuzzy':
          results = await this.executeFuzzySearch(request);
          break;
        case 'hybrid':
        default:
          results = await this.executeHybridSearch(request);
          break;
      }

      // Apply filters and sorting
      results = await this.applyFilters(results, request.filters);
      results = this.applySorting(results, request.sortBy, request.sortOrder);

      // Apply pagination
      const { page = 1, limit = 20 } = request.pagination || {};
      const startIndex = (page - 1) * limit;
      const paginatedResults = results.slice(startIndex, startIndex + limit);

      // Generate facets
      const facets = await this.generateFacets(results);

      const searchTime = Date.now() - startTime;

      return {
        results: paginatedResults,
        totalCount: results.length,
        searchTime,
        facets,
      };
    } catch (error) {
      this.emit('searchError', { request, error });
      throw error;
    }
  }

  private async executeFullTextSearch(request: SearchRequest): Promise<SearchResult[]> {
    // Use Rust search engine for full-text search
    const rawResults = await this.searchEngine.fullTextSearch({
      query: request.query,
      limit: 1000, // Get more results for filtering
    });

    return this.transformSearchResults(rawResults);
  }

  private async executeSemanticSearch(request: SearchRequest): Promise<SearchResult[]> {
    // Use Rust search engine for semantic search
    const rawResults = await this.searchEngine.semanticSearch({
      query: request.query,
      limit: 1000,
    });

    return this.transformSearchResults(rawResults);
  }

  private async executeFuzzySearch(request: SearchRequest): Promise<SearchResult[]> {
    // Use search engine for fuzzy search
    const rawResults = await this.searchEngine.fuzzySearch({
      query: request.query,
      limit: 1000,
    });

    return this.transformSearchResults(rawResults);
  }

  private async executeHybridSearch(request: SearchRequest): Promise<SearchResult[]> {
    // Combine multiple search strategies
    const [fullTextResults, semanticResults, fuzzyResults] = await Promise.all([
      this.executeFullTextSearch(request),
      this.executeSemanticSearch(request),
      this.executeFuzzySearch(request),
    ]);

    // Merge and rank results using hybrid scoring
    return this.mergeAndRankResults([fullTextResults, semanticResults, fuzzyResults]);
  }

  private transformSearchResults(rawResults: any[]): SearchResult[] {
    return rawResults.map(result => ({
      id: result.id,
      title: result.title || result.filename,
      content: result.content,
      snippet: result.snippet || result.content.substring(0, 200) + '...',
      score: result.score,
      filePath: result.file_path,
      fileType: result.file_type,
      size: result.size,
      createdAt: result.created_at,
      modifiedAt: result.modified_at,
      tags: result.tags || [],
      entities: result.entities || [],
      highlights: result.highlights || [],
    }));
  }

  private async applyFilters(results: SearchResult[], filters?: SearchRequest['filters']): Promise<SearchResult[]> {
    if (!filters) return results;

    let filteredResults = results;

    // File type filter
    if (filters.fileTypes && filters.fileTypes.length > 0) {
      filteredResults = filteredResults.filter(result =>
        filters.fileTypes!.includes(result.fileType)
      );
    }

    // Date range filter
    if (filters.dateRange) {
      filteredResults = filteredResults.filter(result => {
        const resultDate = new Date(result.modifiedAt);
        if (filters.dateRange!.start && resultDate < new Date(filters.dateRange!.start)) {
          return false;
        }
        if (filters.dateRange!.end && resultDate > new Date(filters.dateRange!.end)) {
          return false;
        }
        return true;
      });
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      filteredResults = filteredResults.filter(result =>
        filters.tags!.some(tag => result.tags.includes(tag))
      );
    }

    // Minimum score filter
    if (filters.minScore !== undefined) {
      filteredResults = filteredResults.filter(result =>
        result.score >= filters.minScore!
      );
    }

    return filteredResults;
  }

  private applySorting(results: SearchResult[], sortBy: string, sortOrder: string): SearchResult[] {
    return results.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'relevance':
          comparison = b.score - a.score;
          break;
        case 'date':
          comparison = new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        default:
          comparison = b.score - a.score;
      }

      return sortOrder === 'asc' ? -comparison : comparison;
    });
  }

  private mergeAndRankResults(resultSets: SearchResult[][]): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();
    const scoreWeights = [0.5, 0.3, 0.2]; // Weights for fulltext, semantic, fuzzy

    resultSets.forEach((results, index) => {
      results.forEach(result => {
        if (resultMap.has(result.id)) {
          // Boost score for results appearing in multiple searches
          const existing = resultMap.get(result.id)!;
          existing.score = existing.score + (result.score * scoreWeights[index]);
        } else {
          // Apply weight to initial score
          result.score = result.score * scoreWeights[index];
          resultMap.set(result.id, result);
        }
      });
    });

    return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
  }

  private async generateFacets(results: SearchResult[]) {
    const fileTypeCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const dateRangeCounts = new Map<string, number>();

    results.forEach(result => {
      // File types
      fileTypeCounts.set(result.fileType, (fileTypeCounts.get(result.fileType) || 0) + 1);

      // Tags
      result.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });

      // Date ranges (simplified buckets)
      const date = new Date(result.modifiedAt);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      
      let range = 'More than a year';
      if (daysDiff <= 1) range = 'Today';
      else if (daysDiff <= 7) range = 'This week';
      else if (daysDiff <= 30) range = 'This month';
      else if (daysDiff <= 365) range = 'This year';

      dateRangeCounts.set(range, (dateRangeCounts.get(range) || 0) + 1);
    });

    return {
      fileTypes: Array.from(fileTypeCounts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      tags: Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count),
      dateRanges: Array.from(dateRangeCounts.entries())
        .map(([range, count]) => ({ range, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async findSimilarDocuments(documentId: string, threshold: number, maxResults: number): Promise<SimilarDocument[]> {
    try {
      const rawResults = await this.searchEngine.findSimilar({
        documentId,
        threshold,
        maxResults,
      });

      return rawResults.map(result => ({
        id: result.id,
        title: result.title,
        filePath: result.file_path,
        similarity: result.similarity,
        snippet: result.snippet || result.content?.substring(0, 200) + '...',
      }));
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async getAutoCompleteSuggestions(query: string, maxSuggestions: number): Promise<AutoCompleteSuggestion[]> {
    try {
      // Get suggestions from search history and indexed content
      const [historySuggestions, contentSuggestions] = await Promise.all([
        this.getHistoryBasedSuggestions(query, maxSuggestions / 2),
        this.getContentBasedSuggestions(query, maxSuggestions / 2),
      ]);

      const allSuggestions = [...historySuggestions, ...contentSuggestions];
      
      // Remove duplicates and sort by frequency
      const uniqueSuggestions = Array.from(
        new Map(allSuggestions.map(s => [s.text, s])).values()
      );

      return uniqueSuggestions
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, maxSuggestions);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async getHistoryBasedSuggestions(query: string, limit: number): Promise<AutoCompleteSuggestion[]> {
    const db = this.dbManager.getSQLiteConnection();
    const stmt = db.prepare(`
      SELECT query, COUNT(*) as frequency
      FROM search_history 
      WHERE query LIKE ? 
      GROUP BY query 
      ORDER BY frequency DESC 
      LIMIT ?
    `);
    
    const results = stmt.all(`%${query}%`, limit);
    return results.map(row => ({
      text: row.query,
      type: 'query' as const,
      frequency: row.frequency,
    }));
  }

  private async getContentBasedSuggestions(query: string, limit: number): Promise<AutoCompleteSuggestion[]> {
    // Get suggestions from entity extraction and tags
    const rawSuggestions = await this.searchEngine.getAutoCompleteSuggestions({
      query,
      limit,
    });

    return rawSuggestions.map(suggestion => ({
      text: suggestion.text,
      type: suggestion.type,
      frequency: suggestion.frequency,
    }));
  }

  async recordSearchHistory(request: SearchRequest, userId?: string): Promise<void> {
    const db = this.dbManager.getSQLiteConnection();
    const stmt = db.prepare(`
      INSERT INTO search_history (id, query, type, user_id, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(uuidv4(), request.query, request.type, userId, new Date().toISOString());
  }

  async getSearchHistory(userId?: string, limit: number = 50): Promise<SearchHistoryItem[]> {
    const db = this.dbManager.getSQLiteConnection();
    let stmt;
    let results;

    if (userId) {
      stmt = db.prepare(`
        SELECT id, query, type, timestamp, result_count, user_id
        FROM search_history 
        WHERE user_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `);
      results = stmt.all(userId, limit);
    } else {
      stmt = db.prepare(`
        SELECT id, query, type, timestamp, result_count, user_id
        FROM search_history 
        ORDER BY timestamp DESC 
        LIMIT ?
      `);
      results = stmt.all(limit);
    }

    return results.map(row => ({
      id: row.id,
      query: row.query,
      type: row.type,
      timestamp: row.timestamp,
      resultCount: row.result_count || 0,
      userId: row.user_id,
    }));
  }

  async clearSearchHistory(userId?: string): Promise<void> {
    const db = this.dbManager.getSQLiteConnection();
    
    if (userId) {
      const stmt = db.prepare('DELETE FROM search_history WHERE user_id = ?');
      stmt.run(userId);
    } else {
      const stmt = db.prepare('DELETE FROM search_history');
      stmt.run();
    }
  }

  async getSearchStatistics(userId?: string, timeRange: string = 'month'): Promise<SearchStats> {
    const db = this.dbManager.getSQLiteConnection();
    const dateCondition = this.getDateCondition(timeRange);
    
    // Total searches
    let totalSearchesStmt;
    if (userId) {
      totalSearchesStmt = db.prepare(`
        SELECT COUNT(*) as total 
        FROM search_history 
        WHERE user_id = ? AND ${dateCondition}
      `);
    } else {
      totalSearchesStmt = db.prepare(`
        SELECT COUNT(*) as total 
        FROM search_history 
        WHERE ${dateCondition}
      `);
    }

    const totalSearches = userId ? 
      totalSearchesStmt.get(userId).total : 
      totalSearchesStmt.get().total;

    // Top queries
    let topQueriesStmt;
    if (userId) {
      topQueriesStmt = db.prepare(`
        SELECT query, COUNT(*) as count 
        FROM search_history 
        WHERE user_id = ? AND ${dateCondition}
        GROUP BY query 
        ORDER BY count DESC 
        LIMIT 10
      `);
    } else {
      topQueriesStmt = db.prepare(`
        SELECT query, COUNT(*) as count 
        FROM search_history 
        WHERE ${dateCondition}
        GROUP BY query 
        ORDER BY count DESC 
        LIMIT 10
      `);
    }

    const topQueries = userId ? 
      topQueriesStmt.all(userId) : 
      topQueriesStmt.all();

    // Search frequency over time
    let frequencyStmt;
    if (userId) {
      frequencyStmt = db.prepare(`
        SELECT DATE(timestamp) as date, COUNT(*) as count 
        FROM search_history 
        WHERE user_id = ? AND ${dateCondition}
        GROUP BY DATE(timestamp) 
        ORDER BY date
      `);
    } else {
      frequencyStmt = db.prepare(`
        SELECT DATE(timestamp) as date, COUNT(*) as count 
        FROM search_history 
        WHERE ${dateCondition}
        GROUP BY DATE(timestamp) 
        ORDER BY date
      `);
    }

    const searchFrequency = userId ? 
      frequencyStmt.all(userId) : 
      frequencyStmt.all();

    return {
      totalSearches,
      avgResultsPerSearch: totalSearches > 0 ? Math.round(totalSearches / searchFrequency.length) : 0,
      topQueries,
      searchFrequency,
    };
  }

  private getDateCondition(timeRange: string): string {
    switch (timeRange) {
      case 'day':
        return "timestamp >= datetime('now', '-1 day')";
      case 'week':
        return "timestamp >= datetime('now', '-7 days')";
      case 'month':
        return "timestamp >= datetime('now', '-1 month')";
      case 'year':
        return "timestamp >= datetime('now', '-1 year')";
      default:
        return "timestamp >= datetime('now', '-1 month')";
    }
  }

  async performAdvancedSearch(request: AdvancedSearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    
    try {
      // Build complex query from filters
      const searchQuery = this.buildAdvancedQuery(request.filters);
      
      // Execute search using the search engine
      const rawResults = await this.searchEngine.advancedSearch(searchQuery);
      
      // Transform results
      let results = this.transformSearchResults(rawResults);
      
      // Apply additional filters
      results = await this.applyAdvancedFilters(results, request.filters);
      
      // Apply sorting
      results = this.applySorting(results, request.sortBy, request.sortOrder);
      
      // Apply pagination
      const { page = 1, limit = 20 } = request.pagination || {};
      const startIndex = (page - 1) * limit;
      const paginatedResults = results.slice(startIndex, startIndex + limit);
      
      // Generate facets
      const facets = await this.generateFacets(results);
      
      const searchTime = Date.now() - startTime;
      
      return {
        results: paginatedResults,
        totalCount: results.length,
        searchTime,
        facets,
      };
    } catch (error) {
      this.emit('advancedSearchError', { request, error });
      throw error;
    }
  }

  private buildAdvancedQuery(filters: AdvancedSearchRequest['filters']): any {
    const query: any = {
      conditions: [],
    };

    if (filters.fullTextQuery) {
      query.conditions.push({
        type: 'fulltext',
        field: 'content',
        value: filters.fullTextQuery,
      });
    }

    if (filters.semanticQuery) {
      query.conditions.push({
        type: 'semantic',
        field: 'content',
        value: filters.semanticQuery,
      });
    }

    if (filters.entityFilters && filters.entityFilters.length > 0) {
      query.conditions.push({
        type: 'entity',
        entities: filters.entityFilters,
      });
    }

    if (filters.contentType && filters.contentType.length > 0) {
      query.conditions.push({
        type: 'filter',
        field: 'file_type',
        operator: 'in',
        value: filters.contentType,
      });
    }

    if (filters.fileSize) {
      if (filters.fileSize.min !== undefined) {
        query.conditions.push({
          type: 'filter',
          field: 'size',
          operator: 'gte',
          value: filters.fileSize.min,
        });
      }
      if (filters.fileSize.max !== undefined) {
        query.conditions.push({
          type: 'filter',
          field: 'size',
          operator: 'lte',
          value: filters.fileSize.max,
        });
      }
    }

    if (filters.createdDate) {
      if (filters.createdDate.start) {
        query.conditions.push({
          type: 'filter',
          field: 'created_at',
          operator: 'gte',
          value: filters.createdDate.start,
        });
      }
      if (filters.createdDate.end) {
        query.conditions.push({
          type: 'filter',
          field: 'created_at',
          operator: 'lte',
          value: filters.createdDate.end,
        });
      }
    }

    if (filters.modifiedDate) {
      if (filters.modifiedDate.start) {
        query.conditions.push({
          type: 'filter',
          field: 'modified_at',
          operator: 'gte',
          value: filters.modifiedDate.start,
        });
      }
      if (filters.modifiedDate.end) {
        query.conditions.push({
          type: 'filter',
          field: 'modified_at',
          operator: 'lte',
          value: filters.modifiedDate.end,
        });
      }
    }

    return query;
  }

  private async applyAdvancedFilters(results: SearchResult[], filters: AdvancedSearchRequest['filters']): Promise<SearchResult[]> {
    // Additional filtering logic that wasn't handled in the search engine
    return results; // Most filtering is done in buildAdvancedQuery
  }

  async getTrendingSearchTerms(timeRange: string, limit: number): Promise<TrendingTerm[]> {
    const db = this.dbManager.getSQLiteConnection();
    const dateCondition = this.getDateCondition(timeRange);
    
    // Get current period data
    const currentStmt = db.prepare(`
      SELECT query, COUNT(*) as count 
      FROM search_history 
      WHERE ${dateCondition}
      GROUP BY query 
      ORDER BY count DESC 
      LIMIT ?
    `);
    const currentResults = currentStmt.all(limit);

    // Get previous period data for trend calculation
    const prevDateCondition = this.getPreviousDateCondition(timeRange);
    const prevStmt = db.prepare(`
      SELECT query, COUNT(*) as count 
      FROM search_history 
      WHERE ${prevDateCondition}
      GROUP BY query
    `);
    const prevResults = prevStmt.all();
    const prevMap = new Map(prevResults.map(r => [r.query, r.count]));

    // Calculate trends
    return currentResults.map(current => {
      const prevCount = prevMap.get(current.query) || 0;
      let trend: 'rising' | 'stable' | 'falling' = 'stable';
      let percentage = 0;

      if (prevCount > 0) {
        percentage = ((current.count - prevCount) / prevCount) * 100;
        if (percentage > 10) trend = 'rising';
        else if (percentage < -10) trend = 'falling';
      } else if (current.count > 0) {
        trend = 'rising';
        percentage = 100;
      }

      return {
        term: current.query,
        count: current.count,
        trend,
        percentage: Math.round(percentage),
      };
    });
  }

  private getPreviousDateCondition(timeRange: string): string {
    switch (timeRange) {
      case 'day':
        return "timestamp >= datetime('now', '-2 days') AND timestamp < datetime('now', '-1 day')";
      case 'week':
        return "timestamp >= datetime('now', '-14 days') AND timestamp < datetime('now', '-7 days')";
      case 'month':
        return "timestamp >= datetime('now', '-2 months') AND timestamp < datetime('now', '-1 month')";
      default:
        return "timestamp >= datetime('now', '-2 months') AND timestamp < datetime('now', '-1 month')";
    }
  }
}