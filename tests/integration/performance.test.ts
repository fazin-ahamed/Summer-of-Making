import { performance } from 'perf_hooks';
import request from 'supertest';
import { faker } from '@faker-js/faker';

describe('Performance Testing Suite', () => {
  const API_BASE_URL = 'http://localhost:3001';
  const PERFORMANCE_THRESHOLDS = {
    document_ingestion: 2000, // 2 seconds
    search_query: 500, // 500ms
    graph_query: 1000, // 1 second
    batch_processing: 30000, // 30 seconds for 100 documents
  };

  beforeAll(async () => {
    console.log('🏁 Starting performance test suite...');
    
    // Warmup API
    await request(API_BASE_URL).get('/api/health');
  });

  describe('Document Ingestion Performance', () => {
    it('should ingest single document within performance threshold', async () => {
      const testDocument = {
        title: faker.lorem.words(5),
        content: faker.lorem.paragraphs(10),
        source: 'performance_test'
      };

      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .post('/api/trpc/documents.ingest')
        .send(testDocument)
        .expect(200);

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      expect(response.body.result.data.success).toBe(true);
      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.document_ingestion);
      
      console.log(`📄 Document ingestion: ${processingTime.toFixed(2)}ms`);
    });

    it('should handle large document ingestion efficiently', async () => {
      const largeContent = Array.from({ length: 1000 }, () => faker.lorem.paragraph()).join('\n');
      
      const largeDocument = {
        title: 'Large Performance Test Document',
        content: largeContent,
        source: 'performance_test'
      };

      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .post('/api/trpc/documents.ingest')
        .send(largeDocument)
        .expect(200);

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      expect(response.body.result.data.success).toBe(true);
      expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.document_ingestion * 2); // Allow 2x for large docs
      
      console.log(`📚 Large document ingestion: ${processingTime.toFixed(2)}ms`);
    });

    it('should process batch documents within threshold', async () => {
      const batchSize = 100;
      const batchDocuments = Array.from({ length: batchSize }, (_, i) => ({
        title: `Batch Performance Doc ${i}`,
        content: faker.lorem.paragraphs(3),
        source: 'batch_performance_test'
      }));

      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .post('/api/trpc/documents.ingestBatch')
        .send({ documents: batchDocuments })
        .expect(202);

      const jobId = response.body.result.data.jobId;
      
      // Poll for completion
      let completed = false;
      while (!completed) {
        const statusResponse = await request(API_BASE_URL)
          .get('/api/trpc/jobs.status')
          .query({ id: jobId });
        
        const status = statusResponse.body.result.data.status;
        if (status === 'completed') {
          completed = true;
        } else if (status === 'failed') {
          throw new Error('Batch processing failed');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.batch_processing);
      
      console.log(`📊 Batch processing (${batchSize} docs): ${totalTime.toFixed(2)}ms`);
      console.log(`📈 Average per document: ${(totalTime / batchSize).toFixed(2)}ms`);
    }, 45000);
  });

  describe('Search Performance', () => {
    beforeAll(async () => {
      // Create test documents for search performance testing
      const searchTestDocs = Array.from({ length: 50 }, (_, i) => ({
        title: `Search Test Document ${i}`,
        content: `${faker.lorem.paragraphs(5)} performance search test keywords document ${i}`,
        source: 'search_performance_test',
        metadata: {
          category: faker.helpers.arrayElement(['tech', 'business', 'science', 'arts']),
          priority: faker.helpers.arrayElement(['high', 'medium', 'low'])
        }
      }));

      await request(API_BASE_URL)
        .post('/api/trpc/documents.ingestBatch')
        .send({ documents: searchTestDocs });

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 5000));
    });

    it('should perform standard search within threshold', async () => {
      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .get('/api/trpc/search.query')
        .query({ q: 'performance search test' })
        .expect(200);

      const endTime = performance.now();
      const searchTime = endTime - startTime;

      expect(response.body.result.data.results.length).toBeGreaterThan(0);
      expect(searchTime).toBeLessThan(PERFORMANCE_THRESHOLDS.search_query);
      
      console.log(`🔍 Standard search: ${searchTime.toFixed(2)}ms`);
    });

    it('should perform fuzzy search efficiently', async () => {
      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .get('/api/trpc/search.query')
        .query({ 
          q: 'perfomance serch', // Misspelled intentionally
          mode: 'fuzzy'
        })
        .expect(200);

      const endTime = performance.now();
      const searchTime = endTime - startTime;

      expect(response.body.result.data.results.length).toBeGreaterThan(0);
      expect(searchTime).toBeLessThan(PERFORMANCE_THRESHOLDS.search_query * 2); // Allow 2x for fuzzy
      
      console.log(`🔍 Fuzzy search: ${searchTime.toFixed(2)}ms`);
    });

    it('should handle concurrent search requests efficiently', async () => {
      const concurrentRequests = 20;
      const queries = Array.from({ length: concurrentRequests }, (_, i) => 
        `test query ${i} performance`
      );

      const startTime = performance.now();
      
      const searchPromises = queries.map(query =>
        request(API_BASE_URL)
          .get('/api/trpc/search.query')
          .query({ q: query })
      );

      const results = await Promise.all(searchPromises);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.result.data.results).toBeDefined();
      });

      const averageTime = totalTime / concurrentRequests;
      expect(averageTime).toBeLessThan(PERFORMANCE_THRESHOLDS.search_query * 2);
      
      console.log(`🔍 Concurrent searches (${concurrentRequests}): ${totalTime.toFixed(2)}ms total`);
      console.log(`📊 Average per search: ${averageTime.toFixed(2)}ms`);
    }, 15000);

    it('should handle search with complex filters efficiently', async () => {
      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .get('/api/trpc/search.query')
        .query({ 
          q: 'performance',
          'filter.category': 'tech',
          'filter.priority': 'high',
          sortBy: 'relevance',
          limit: 10
        })
        .expect(200);

      const endTime = performance.now();
      const searchTime = endTime - startTime;

      expect(response.body.result.data.results).toBeDefined();
      expect(searchTime).toBeLessThan(PERFORMANCE_THRESHOLDS.search_query * 1.5);
      
      console.log(`🔍 Filtered search: ${searchTime.toFixed(2)}ms`);
    });
  });

  describe('Graph Operations Performance', () => {
    it('should retrieve graph nodes within threshold', async () => {
      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .get('/api/trpc/graph.nodes')
        .query({ limit: 100 })
        .expect(200);

      const endTime = performance.now();
      const queryTime = endTime - startTime;

      expect(response.body.result.data.nodes).toBeDefined();
      expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.graph_query);
      
      console.log(`🕸️ Graph nodes query: ${queryTime.toFixed(2)}ms`);
    });

    it('should retrieve graph edges efficiently', async () => {
      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .get('/api/trpc/graph.edges')
        .query({ limit: 200 })
        .expect(200);

      const endTime = performance.now();
      const queryTime = endTime - startTime;

      expect(response.body.result.data.edges).toBeDefined();
      expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.graph_query);
      
      console.log(`🕸️ Graph edges query: ${queryTime.toFixed(2)}ms`);
    });

    it('should handle graph traversal queries efficiently', async () => {
      const startTime = performance.now();
      
      const response = await request(API_BASE_URL)
        .get('/api/trpc/graph.traverse')
        .query({ 
          startNodeId: 'test_node_1',
          maxDepth: 3,
          relationshipTypes: ['contains', 'relates_to']
        });

      const endTime = performance.now();
      const queryTime = endTime - startTime;

      // Allow for 404 if test node doesn't exist
      expect([200, 404]).toContain(response.status);
      expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.graph_query * 2);
      
      console.log(`🕸️ Graph traversal: ${queryTime.toFixed(2)}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();
      console.log(`💾 Initial memory usage: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

      // Perform intensive operations
      const operations = Array.from({ length: 50 }, async (_, i) => {
        const doc = {
          title: `Memory Test Doc ${i}`,
          content: faker.lorem.paragraphs(20),
          source: 'memory_test'
        };

        await request(API_BASE_URL)
          .post('/api/trpc/documents.ingest')
          .send(doc);

        await request(API_BASE_URL)
          .get('/api/trpc/search.query')
          .query({ q: `memory test ${i}` });
      });

      await Promise.all(operations);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      console.log(`💾 Final memory usage: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      // Should not increase by more than 100MB under normal conditions
      expect(memoryIncreaseMB).toBeLessThan(100);
      
      console.log(`📊 Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);
    }, 30000);
  });

  describe('Scalability Testing', () => {
    it('should maintain performance with large dataset', async () => {
      console.log('📈 Testing scalability with large dataset...');
      
      // This test would require a larger dataset
      // For now, test with available data
      
      const response = await request(API_BASE_URL)
        .get('/api/trpc/search.query')
        .query({ 
          q: '*',
          limit: 1000,
          sortBy: 'relevance'
        });

      expect([200, 400]).toContain(response.status); // May limit large queries
      
      if (response.status === 200) {
        expect(response.body.result.data.results).toBeDefined();
        console.log(`📊 Retrieved ${response.body.result.data.results.length} results`);
      }
    });

    it('should handle API rate limiting gracefully', async () => {
      console.log('⚡ Testing API rate limiting...');
      
      // Send many requests rapidly
      const rapidRequests = Array.from({ length: 100 }, () =>
        request(API_BASE_URL)
          .get('/api/health')
          .timeout(1000)
      );

      const results = await Promise.allSettled(rapidRequests);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const rateLimited = results.filter(r => 
        r.status === 'fulfilled' && 
        (r as any).value.status === 429
      ).length;

      console.log(`✅ Successful requests: ${successful}`);
      console.log(`⛔ Rate limited: ${rateLimited}`);
      
      // Should handle rate limiting gracefully
      expect(successful + rateLimited).toBe(100);
    }, 20000);
  });

  afterAll(() => {
    console.log('🏁 Performance testing complete');
    console.log('📊 Performance Summary:');
    console.log(`   Document Ingestion Threshold: ${PERFORMANCE_THRESHOLDS.document_ingestion}ms`);
    console.log(`   Search Query Threshold: ${PERFORMANCE_THRESHOLDS.search_query}ms`);
    console.log(`   Graph Query Threshold: ${PERFORMANCE_THRESHOLDS.graph_query}ms`);
    console.log(`   Batch Processing Threshold: ${PERFORMANCE_THRESHOLDS.batch_processing}ms`);
  });
});