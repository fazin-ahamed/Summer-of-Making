import { spawn, ChildProcess } from 'child_process';
import request from 'supertest';
import path from 'path';
import fs from 'fs/promises';
import { createClient } from 'redis';
import neo4j from 'neo4j-driver';
import { faker } from '@faker-js/faker';

describe('End-to-End Integration Tests', () => {
  let apiProcess: ChildProcess;
  let redisClient: any;
  let neo4jDriver: any;
  let testDocuments: any[] = [];
  const API_BASE_URL = 'http://localhost:3001';

  beforeAll(async () => {
    console.log('🚀 Starting integration test setup...');

    // Start Redis
    redisClient = createClient({ url: 'redis://localhost:6379' });
    await redisClient.connect();
    await redisClient.flushAll(); // Clear test data

    // Setup Neo4j
    neo4jDriver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'password'));
    const session = neo4jDriver.session();
    await session.run('MATCH (n) DETACH DELETE n'); // Clear test data
    await session.close();

    // Start API server
    apiProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '../../../backend/api'),
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3001',
        DATABASE_PATH: ':memory:',
        REDIS_URL: 'redis://localhost:6379',
        NEO4J_URI: 'bolt://localhost:7687'
      }
    });

    // Wait for API to be ready
    await new Promise((resolve) => {
      apiProcess.stdout?.on('data', (data) => {
        if (data.toString().includes('Server listening on port 3001')) {
          resolve(true);
        }
      });
    });

    console.log('✅ Integration test environment ready');
  }, 30000);

  afterAll(async () => {
    console.log('🧹 Cleaning up integration test environment...');

    if (apiProcess) {
      apiProcess.kill();
    }

    if (redisClient) {
      await redisClient.quit();
    }

    if (neo4jDriver) {
      await neo4jDriver.close();
    }

    console.log('✅ Integration test cleanup complete');
  });

  describe('Document Lifecycle Integration', () => {
    it('should handle complete document ingestion and search workflow', async () => {
      // Step 1: Ingest a document
      const testDocument = {
        title: 'Integration Test Document',
        content: 'This is a comprehensive integration test for document processing. It contains entities like john.doe@example.com and https://example.com',
        source: 'integration_test',
        metadata: {
          author: faker.person.fullName(),
          tags: ['integration', 'test', 'automation']
        }
      };

      console.log('📄 Ingesting test document...');
      const ingestResponse = await request(API_BASE_URL)
        .post('/api/trpc/documents.ingest')
        .send(testDocument)
        .expect(200);

      expect(ingestResponse.body.result.data.success).toBe(true);
      const documentId = ingestResponse.body.result.data.documentId;
      testDocuments.push(documentId);

      // Step 2: Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Verify document is searchable
      console.log('🔍 Testing document search...');
      const searchResponse = await request(API_BASE_URL)
        .get('/api/trpc/search.query')
        .query({ q: 'integration test' })
        .expect(200);

      expect(searchResponse.body.result.data.results.length).toBeGreaterThan(0);
      const foundDoc = searchResponse.body.result.data.results.find(
        (doc: any) => doc.documentId === documentId
      );
      expect(foundDoc).toBeDefined();
      expect(foundDoc.title).toBe(testDocument.title);

      // Step 4: Verify entities were extracted
      console.log('🏷️ Verifying entity extraction...');
      const docResponse = await request(API_BASE_URL)
        .get('/api/trpc/documents.get')
        .query({ id: documentId })
        .expect(200);

      const document = docResponse.body.result.data.document;
      expect(document.extractedEntities.length).toBeGreaterThan(0);
      
      const emailEntity = document.extractedEntities.find((e: any) => e.type === 'email');
      const urlEntity = document.extractedEntities.find((e: any) => e.type === 'url');
      
      expect(emailEntity).toBeDefined();
      expect(emailEntity.text).toBe('john.doe@example.com');
      expect(urlEntity).toBeDefined();
      expect(urlEntity.text).toBe('https://example.com');

      // Step 5: Verify graph relationships were created
      console.log('🕸️ Checking graph relationships...');
      const graphResponse = await request(API_BASE_URL)
        .get('/api/trpc/graph.nodes')
        .query({ documentId })
        .expect(200);

      expect(graphResponse.body.result.data.nodes.length).toBeGreaterThan(0);
      
      const documentNode = graphResponse.body.result.data.nodes.find(
        (node: any) => node.type === 'document' && node.id === documentId
      );
      expect(documentNode).toBeDefined();
    }, 15000);

    it('should handle batch document processing', async () => {
      console.log('📚 Testing batch document processing...');
      
      const batchDocuments = Array.from({ length: 5 }, (_, i) => ({
        title: `Batch Document ${i + 1}`,
        content: faker.lorem.paragraphs(3),
        source: 'batch_test',
        metadata: {
          batch: true,
          index: i
        }
      }));

      // Submit batch processing job
      const batchResponse = await request(API_BASE_URL)
        .post('/api/trpc/documents.ingestBatch')
        .send({ documents: batchDocuments })
        .expect(202);

      const jobId = batchResponse.body.result.data.jobId;
      expect(jobId).toBeDefined();

      // Poll for job completion
      let jobComplete = false;
      let attempts = 0;
      const maxAttempts = 30;

      while (!jobComplete && attempts < maxAttempts) {
        const statusResponse = await request(API_BASE_URL)
          .get('/api/trpc/jobs.status')
          .query({ id: jobId });

        const status = statusResponse.body.result.data.status;
        
        if (status === 'completed') {
          jobComplete = true;
          console.log('✅ Batch processing completed');
        } else if (status === 'failed') {
          throw new Error('Batch processing failed');
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      expect(jobComplete).toBe(true);

      // Verify all documents were processed
      const listResponse = await request(API_BASE_URL)
        .get('/api/trpc/documents.list')
        .query({ 'filter.source': 'batch_test' })
        .expect(200);

      expect(listResponse.body.result.data.documents).toHaveLength(5);
    }, 45000);
  });

  describe('Cross-Platform Integration', () => {
    it('should handle desktop app file watching integration', async () => {
      console.log('💻 Testing desktop file watching integration...');
      
      // Create a temporary file
      const tempFilePath = path.join(__dirname, 'temp_test_file.txt');
      await fs.writeFile(tempFilePath, 'Temporary test file content for watching');

      // Setup file watcher via API
      const watchResponse = await request(API_BASE_URL)
        .post('/api/trpc/files.watch')
        .send({ 
          path: path.dirname(tempFilePath),
          recursive: false
        })
        .expect(200);

      expect(watchResponse.body.result.data.success).toBe(true);

      // Modify the file to trigger watch event
      await fs.appendFile(tempFilePath, '\nAdditional content added');

      // Wait for file change to be processed
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if document was automatically ingested
      const searchResponse = await request(API_BASE_URL)
        .get('/api/trpc/search.query')
        .query({ q: 'temp_test_file' })
        .expect(200);

      expect(searchResponse.body.result.data.results.length).toBeGreaterThan(0);

      // Cleanup
      await fs.unlink(tempFilePath);
      
      await request(API_BASE_URL)
        .post('/api/trpc/files.unwatch')
        .send({ path: path.dirname(tempFilePath) })
        .expect(200);
    }, 20000);

    it('should handle mobile app document scanning workflow', async () => {
      console.log('📱 Testing mobile document scanning workflow...');
      
      // Simulate mobile app uploading scanned document
      const mockImageData = Buffer.from('fake_image_data_for_testing');
      
      const scanResponse = await request(API_BASE_URL)
        .post('/api/trpc/mobile.processScannedDocument')
        .attach('image', mockImageData, 'scanned_document.jpg')
        .field('enhanceImage', 'true')
        .field('extractText', 'true')
        .expect(200);

      expect(scanResponse.body.result.data.success).toBe(true);
      expect(scanResponse.body.result.data.documentId).toBeDefined();
      
      const scannedDocId = scanResponse.body.result.data.documentId;
      testDocuments.push(scannedDocId);

      // Verify OCR processing completed
      const docResponse = await request(API_BASE_URL)
        .get('/api/trpc/documents.get')
        .query({ id: scannedDocId })
        .expect(200);

      const document = docResponse.body.result.data.document;
      expect(document.metadata.processedByOCR).toBe(true);
      expect(document.content).toBeDefined();
    });
  });

  describe('Real-time Features Integration', () => {
    it('should handle WebSocket notifications for document updates', async () => {
      console.log('🔔 Testing WebSocket notifications...');
      
      // This test would require WebSocket client setup
      // Simplified version focusing on the notification system
      
      const notificationResponse = await request(API_BASE_URL)
        .get('/api/trpc/notifications.list')
        .expect(200);

      expect(notificationResponse.body.result.data.notifications).toBeDefined();
    });

    it('should handle collaborative features', async () => {
      console.log('👥 Testing collaborative features...');
      
      // Simulate multiple users accessing the same document
      const documentId = testDocuments[0];
      
      const collaborationResponse = await request(API_BASE_URL)
        .post('/api/trpc/collaboration.startSession')
        .send({ 
          documentId,
          userId: 'test_user_1'
        })
        .expect(200);

      expect(collaborationResponse.body.result.data.sessionId).toBeDefined();
    });
  });

  describe('Performance and Scale Integration', () => {
    it('should handle high-volume search queries', async () => {
      console.log('⚡ Testing high-volume search performance...');
      
      const searchPromises = Array.from({ length: 20 }, (_, i) => 
        request(API_BASE_URL)
          .get('/api/trpc/search.query')
          .query({ q: `test query ${i}` })
      );

      const results = await Promise.all(searchPromises);
      
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.result.data).toBeDefined();
      });

      console.log('✅ All concurrent searches completed successfully');
    }, 30000);

    it('should handle database consistency under load', async () => {
      console.log('🗄️ Testing database consistency under load...');
      
      // Create multiple documents simultaneously
      const concurrentIngestions = Array.from({ length: 10 }, (_, i) =>
        request(API_BASE_URL)
          .post('/api/trpc/documents.ingest')
          .send({
            title: `Concurrent Document ${i}`,
            content: faker.lorem.paragraphs(2),
            source: 'concurrency_test'
          })
      );

      const ingestionResults = await Promise.all(concurrentIngestions);
      
      ingestionResults.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.result.data.success).toBe(true);
      });

      // Verify all documents were stored correctly
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const listResponse = await request(API_BASE_URL)
        .get('/api/trpc/documents.list')
        .query({ 'filter.source': 'concurrency_test' })
        .expect(200);

      expect(listResponse.body.result.data.documents).toHaveLength(10);
    }, 25000);
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from database connection issues', async () => {
      console.log('🔄 Testing database connection recovery...');
      
      // This would require actually interrupting database connections
      // Simplified version that tests error handling
      
      const healthResponse = await request(API_BASE_URL)
        .get('/api/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('healthy');
      expect(healthResponse.body.services.database).toBe('connected');
      expect(healthResponse.body.services.redis).toBe('connected');
      expect(healthResponse.body.services.neo4j).toBe('connected');
    });

    it('should handle graceful degradation when services are unavailable', async () => {
      console.log('⚠️ Testing graceful degradation...');
      
      // Test search when some features might be unavailable
      const searchResponse = await request(API_BASE_URL)
        .get('/api/trpc/search.query')
        .query({ 
          q: 'test',
          fallbackMode: true
        });

      // Should still return results even if some advanced features fail
      expect(searchResponse.status).toBeLessThan(500);
    });
  });

  describe('Security Integration', () => {
    it('should handle encrypted document storage and retrieval', async () => {
      console.log('🔐 Testing encrypted document workflow...');
      
      const encryptedDoc = {
        title: 'Sensitive Document',
        content: 'This document contains sensitive information that should be encrypted',
        source: 'security_test',
        encrypted: true,
        metadata: {
          confidentialityLevel: 'high'
        }
      };

      const ingestResponse = await request(API_BASE_URL)
        .post('/api/trpc/documents.ingest')
        .send(encryptedDoc)
        .expect(200);

      expect(ingestResponse.body.result.data.success).toBe(true);
      
      const documentId = ingestResponse.body.result.data.documentId;
      testDocuments.push(documentId);

      // Verify document content is encrypted in storage
      const docResponse = await request(API_BASE_URL)
        .get('/api/trpc/documents.get')
        .query({ id: documentId, decrypt: false })
        .expect(200);

      const encryptedDocument = docResponse.body.result.data.document;
      expect(encryptedDocument.encrypted).toBe(true);
      expect(encryptedDocument.content).not.toBe(encryptedDoc.content); // Should be encrypted

      // Verify document can be decrypted for authorized access
      const decryptedResponse = await request(API_BASE_URL)
        .get('/api/trpc/documents.get')
        .query({ id: documentId, decrypt: true })
        .expect(200);

      const decryptedDocument = decryptedResponse.body.result.data.document;
      expect(decryptedDocument.content).toBe(encryptedDoc.content); // Should be decrypted
    });
  });
});