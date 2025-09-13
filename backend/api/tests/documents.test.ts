import request from 'supertest';
import { faker } from '@faker-js/faker';
import { app } from '../src/index';
import { db } from '../src/database';

describe('Document Ingestion API', () => {
  beforeEach(async () => {
    // Reset database state before each test
    await db.execute('DELETE FROM documents');
    await db.execute('DELETE FROM document_chunks');
  });

  afterAll(async () => {
    await db.close();
  });

  describe('POST /api/documents/ingest', () => {
    it('should successfully ingest a text document', async () => {
      const testDocument = {
        title: faker.lorem.words(3),
        content: faker.lorem.paragraphs(3),
        source: 'upload',
        metadata: {
          author: faker.person.fullName(),
          tags: ['test', 'document']
        }
      };

      const response = await request(app)
        .post('/api/trpc/documents.ingest')
        .send(testDocument)
        .expect(200);

      expect(response.body).toMatchObject({
        result: {
          data: {
            success: true,
            documentId: expect.any(String),
            processingTime: expect.any(Number)
          }
        }
      });
    });

    it('should handle file upload and processing', async () => {
      const testFilePath = '__tests__/fixtures/sample.txt';
      
      const response = await request(app)
        .post('/api/trpc/documents.ingestFile')
        .attach('file', Buffer.from('Test file content'), 'test.txt')
        .expect(200);

      expect(response.body.result.data.success).toBe(true);
      expect(response.body.result.data.document).toMatchObject({
        title: 'test.txt',
        fileType: 'text',
        size: expect.any(Number)
      });
    });

    it('should validate document input', async () => {
      const invalidDocument = {
        content: '', // Empty content should fail validation
        source: 'invalid_source'
      };

      const response = await request(app)
        .post('/api/trpc/documents.ingest')
        .send(invalidDocument)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('validation');
    });

    it('should handle processing errors gracefully', async () => {
      const mockProcessingError = jest.spyOn(require('../src/services/ingestionService'), 'processDocument')
        .mockRejectedValueOnce(new Error('Processing failed'));

      const testDocument = {
        title: 'Test Document',
        content: 'Test content',
        source: 'upload'
      };

      const response = await request(app)
        .post('/api/trpc/documents.ingest')
        .send(testDocument)
        .expect(500);

      expect(response.body.error).toBeDefined();
      mockProcessingError.mockRestore();
    });

    it('should extract entities from document content', async () => {
      const documentWithEntities = {
        title: 'Contact Information',
        content: 'Please contact John Doe at john.doe@example.com or visit https://example.com',
        source: 'upload',
        extractEntities: true
      };

      const response = await request(app)
        .post('/api/trpc/documents.ingest')
        .send(documentWithEntities)
        .expect(200);

      const document = response.body.result.data.document;
      expect(document.extractedEntities).toHaveLength(2);
      expect(document.extractedEntities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'email',
            text: 'john.doe@example.com'
          }),
          expect.objectContaining({
            type: 'url',
            text: 'https://example.com'
          })
        ])
      );
    });
  });

  describe('GET /api/documents', () => {
    beforeEach(async () => {
      // Create test documents
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/trpc/documents.ingest')
          .send({
            title: faker.lorem.words(3),
            content: faker.lorem.paragraphs(2),
            source: 'test'
          });
      }
    });

    it('should retrieve all documents', async () => {
      const response = await request(app)
        .get('/api/trpc/documents.list')
        .expect(200);

      expect(response.body.result.data.documents).toHaveLength(5);
      expect(response.body.result.data.total).toBe(5);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/trpc/documents.list')
        .query({ limit: 2, offset: 0 })
        .expect(200);

      expect(response.body.result.data.documents).toHaveLength(2);
      expect(response.body.result.data.hasMore).toBe(true);
    });

    it('should support filtering by metadata', async () => {
      await request(app)
        .post('/api/trpc/documents.ingest')
        .send({
          title: 'Filtered Document',
          content: 'Content with special tag',
          source: 'test',
          metadata: { category: 'important' }
        });

      const response = await request(app)
        .get('/api/trpc/documents.list')
        .query({ 'filter.category': 'important' })
        .expect(200);

      expect(response.body.result.data.documents).toHaveLength(1);
      expect(response.body.result.data.documents[0].title).toBe('Filtered Document');
    });
  });

  describe('DELETE /api/documents/:id', () => {
    let documentId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/trpc/documents.ingest')
        .send({
          title: 'Document to Delete',
          content: 'This document will be deleted',
          source: 'test'
        });
      
      documentId = response.body.result.data.documentId;
    });

    it('should delete a document successfully', async () => {
      const response = await request(app)
        .delete(`/api/trpc/documents.delete`)
        .send({ id: documentId })
        .expect(200);

      expect(response.body.result.data.success).toBe(true);

      // Verify document is deleted
      const getResponse = await request(app)
        .get(`/api/trpc/documents.get`)
        .query({ id: documentId })
        .expect(404);
    });

    it('should return 404 for non-existent document', async () => {
      const response = await request(app)
        .delete('/api/trpc/documents.delete')
        .send({ id: 'non-existent-id' })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Document Processing Job Queue', () => {
    it('should handle large document processing asynchronously', async () => {
      const largeDocument = {
        title: 'Large Document',
        content: faker.lorem.paragraphs(100), // Very large content
        source: 'upload',
        processAsync: true
      };

      const response = await request(app)
        .post('/api/trpc/documents.ingest')
        .send(largeDocument)
        .expect(202); // Accepted for processing

      expect(response.body.result.data).toMatchObject({
        jobId: expect.any(String),
        status: 'processing',
        message: 'Document queued for processing'
      });
    });

    it('should check job status', async () => {
      // First create a processing job
      const jobResponse = await request(app)
        .post('/api/trpc/documents.ingest')
        .send({
          title: 'Job Document',
          content: faker.lorem.paragraphs(50),
          source: 'upload',
          processAsync: true
        });

      const jobId = jobResponse.body.result.data.jobId;

      // Check job status
      const statusResponse = await request(app)
        .get('/api/trpc/jobs.status')
        .query({ id: jobId })
        .expect(200);

      expect(statusResponse.body.result.data).toMatchObject({
        id: jobId,
        status: expect.stringMatching(/processing|completed|failed/),
        progress: expect.any(Number)
      });
    });
  });
});