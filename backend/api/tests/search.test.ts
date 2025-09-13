import request from 'supertest';
import { faker } from '@faker-js/faker';
import { app } from '../src/index';
import { db } from '../src/database';

describe('Search API', () => {
  beforeEach(async () => {
    // Setup test documents for search
    await db.execute('DELETE FROM documents');
    
    const testDocuments = [
      {
        title: 'Rust Programming Guide',
        content: 'Rust is a systems programming language focused on safety, speed, and concurrency.',
        tags: ['programming', 'rust', 'systems']
      },
      {
        title: 'JavaScript Best Practices',
        content: 'Modern JavaScript development practices for web applications and Node.js.',
        tags: ['programming', 'javascript', 'web']
      },
      {
        title: 'Database Design Patterns',
        content: 'Common patterns for designing scalable database systems and data modeling.',
        tags: ['database', 'design', 'patterns']
      },
      {
        title: 'Machine Learning Basics',
        content: 'Introduction to machine learning algorithms and neural networks.',
        tags: ['ai', 'machine-learning', 'algorithms']
      }
    ];

    for (const doc of testDocuments) {
      await request(app)
        .post('/api/trpc/documents.ingest')
        .send({
          title: doc.title,
          content: doc.content,
          source: 'test',
          metadata: { tags: doc.tags }
        });
    }

    // Wait for indexing to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await db.close();
  });

  describe('GET /api/search', () => {
    it('should perform basic text search', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ q: 'programming' })
        .expect(200);

      expect(response.body.result.data.results).toHaveLength(2);
      expect(response.body.result.data.results[0]).toMatchObject({
        title: expect.stringContaining('Programming'),
        score: expect.any(Number),
        snippet: expect.stringContaining('programming')
      });
    });

    it('should support fuzzy search', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ 
          q: 'progamming', // Misspelled
          mode: 'fuzzy'
        })
        .expect(200);

      expect(response.body.result.data.results.length).toBeGreaterThan(0);
      expect(response.body.result.data.results[0].title).toContain('Programming');
    });

    it('should support boolean search operators', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ 
          q: 'programming AND rust',
          mode: 'boolean'
        })
        .expect(200);

      expect(response.body.result.data.results).toHaveLength(1);
      expect(response.body.result.data.results[0].title).toBe('Rust Programming Guide');
    });

    it('should support wildcard search', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ 
          q: 'program*',
          mode: 'wildcard'
        })
        .expect(200);

      expect(response.body.result.data.results.length).toBeGreaterThan(0);
      expect(response.body.result.data.results.some(r => 
        r.title.toLowerCase().includes('programming')
      )).toBe(true);
    });

    it('should filter by metadata tags', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ 
          q: '*',
          'filter.tags': 'database'
        })
        .expect(200);

      expect(response.body.result.data.results).toHaveLength(1);
      expect(response.body.result.data.results[0].title).toBe('Database Design Patterns');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ 
          q: '*',
          limit: 2,
          offset: 0
        })
        .expect(200);

      expect(response.body.result.data.results).toHaveLength(2);
      expect(response.body.result.data.pagination).toMatchObject({
        offset: 0,
        limit: 2,
        total: 4,
        hasMore: true
      });
    });

    it('should sort results by relevance by default', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ q: 'programming' })
        .expect(200);

      const scores = response.body.result.data.results.map((r: any) => r.score);
      expect(scores).toEqual(scores.slice().sort((a: number, b: number) => b - a));
    });

    it('should support sorting by date', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ 
          q: '*',
          sortBy: 'date'
        })
        .expect(200);

      expect(response.body.result.data.results).toHaveLength(4);
      // Results should be sorted by creation date (newest first)
      const dates = response.body.result.data.results.map((r: any) => new Date(r.createdAt));
      expect(dates).toEqual(dates.slice().sort((a: Date, b: Date) => b.getTime() - a.getTime()));
    });

    it('should provide search suggestions', async () => {
      const response = await request(app)
        .get('/api/trpc/search.suggest')
        .query({ q: 'prog' })
        .expect(200);

      expect(response.body.result.data.suggestions).toContain('programming');
    });

    it('should handle empty search query', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ q: '' })
        .expect(400);

      expect(response.body.error.message).toContain('Query cannot be empty');
    });

    it('should return empty results for non-matching query', async () => {
      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ q: 'nonexistent_term_xyz' })
        .expect(200);

      expect(response.body.result.data.results).toHaveLength(0);
      expect(response.body.result.data.pagination.total).toBe(0);
    });
  });

  describe('Search Analytics', () => {
    it('should track search queries', async () => {
      await request(app)
        .get('/api/trpc/search.query')
        .query({ q: 'programming' });

      const analyticsResponse = await request(app)
        .get('/api/trpc/search.analytics')
        .expect(200);

      expect(analyticsResponse.body.result.data.topQueries).toContainEqual(
        expect.objectContaining({
          query: 'programming',
          count: expect.any(Number)
        })
      );
    });

    it('should provide search performance metrics', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/api/trpc/search.query')
        .query({ q: 'programming' });

      const response = await request(app)
        .get('/api/trpc/search.metrics')
        .expect(200);

      expect(response.body.result.data).toMatchObject({
        averageResponseTime: expect.any(Number),
        totalQueries: expect.any(Number),
        indexSize: expect.any(Number)
      });
    });
  });

  describe('Advanced Search Features', () => {
    it('should support semantic search', async () => {
      const response = await request(app)
        .get('/api/trpc/search.semantic')
        .query({ 
          q: 'software development',
          threshold: 0.7
        })
        .expect(200);

      expect(response.body.result.data.results.length).toBeGreaterThan(0);
      expect(response.body.result.data.results[0]).toMatchObject({
        title: expect.any(String),
        semanticScore: expect.any(Number),
        snippet: expect.any(String)
      });
    });

    it('should support search within specific date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const response = await request(app)
        .get('/api/trpc/search.query')
        .query({ 
          q: '*',
          dateFrom: yesterday,
          dateTo: today
        })
        .expect(200);

      expect(response.body.result.data.results).toHaveLength(4);
      response.body.result.data.results.forEach((result: any) => {
        const resultDate = new Date(result.createdAt);
        expect(resultDate.getTime()).toBeGreaterThanOrEqual(new Date(yesterday).getTime());
        expect(resultDate.getTime()).toBeLessThanOrEqual(new Date(today).getTime());
      });
    });

    it('should support search facets', async () => {
      const response = await request(app)
        .get('/api/trpc/search.facets')
        .query({ q: '*' })
        .expect(200);

      expect(response.body.result.data.facets).toMatchObject({
        tags: expect.objectContaining({
          programming: expect.any(Number),
          database: expect.any(Number),
          ai: expect.any(Number)
        }),
        fileType: expect.any(Object),
        author: expect.any(Object)
      });
    });
  });
});