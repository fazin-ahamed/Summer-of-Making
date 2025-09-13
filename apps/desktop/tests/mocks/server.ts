import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { faker } from '@faker-js/faker';

export const handlers = [
  // Documents API
  rest.post('/api/trpc/documents.ingest', (req, res, ctx) => {
    return res(
      ctx.json({
        result: {
          data: {
            success: true,
            documentId: faker.string.uuid(),
            processingTime: faker.number.int({ min: 100, max: 1000 })
          }
        }
      })
    );
  }),

  rest.get('/api/trpc/documents.list', (req, res, ctx) => {
    const documents = Array.from({ length: 10 }, () => ({
      id: faker.string.uuid(),
      title: faker.lorem.words(3),
      content: faker.lorem.paragraphs(2),
      createdAt: faker.date.recent().toISOString(),
      size: faker.number.int({ min: 1000, max: 100000 }),
      metadata: {
        author: faker.person.fullName(),
        tags: [faker.lorem.word(), faker.lorem.word()]
      }
    }));

    return res(
      ctx.json({
        result: {
          data: {
            documents,
            total: documents.length,
            hasMore: false
          }
        }
      })
    );
  }),

  // Search API
  rest.get('/api/trpc/search.query', (req, res, ctx) => {
    const query = req.url.searchParams.get('q');
    const results = Array.from({ length: 5 }, () => ({
      documentId: faker.string.uuid(),
      title: faker.lorem.words(4),
      snippet: `${faker.lorem.sentence()} ${query} ${faker.lorem.sentence()}`,
      score: faker.number.float({ min: 0.1, max: 1.0 }),
      createdAt: faker.date.recent().toISOString()
    }));

    return res(
      ctx.json({
        result: {
          data: {
            results,
            pagination: {
              total: results.length,
              offset: 0,
              limit: 10,
              hasMore: false
            }
          }
        }
      })
    );
  }),

  // Graph API
  rest.get('/api/trpc/graph.nodes', (req, res, ctx) => {
    const nodes = Array.from({ length: 20 }, () => ({
      id: faker.string.uuid(),
      label: faker.lorem.words(2),
      type: faker.helpers.arrayElement(['document', 'entity', 'topic']),
      properties: {
        weight: faker.number.float({ min: 0.1, max: 1.0 }),
        category: faker.lorem.word()
      }
    }));

    return res(
      ctx.json({
        result: {
          data: { nodes }
        }
      })
    );
  }),

  rest.get('/api/trpc/graph.edges', (req, res, ctx) => {
    const edges = Array.from({ length: 30 }, () => ({
      id: faker.string.uuid(),
      source: faker.string.uuid(),
      target: faker.string.uuid(),
      type: faker.helpers.arrayElement(['contains', 'relates_to', 'mentions']),
      weight: faker.number.float({ min: 0.1, max: 1.0 })
    }));

    return res(
      ctx.json({
        result: {
          data: { edges }
        }
      })
    );
  })
];

export const server = setupServer(...handlers);