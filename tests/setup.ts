import { beforeAll, afterAll } from '@jest/globals';

beforeAll(async () => {
  // Global test setup for integration tests
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.DATABASE_URL = ':memory:';
  
  console.log('🧪 Integration test setup complete');
});

afterAll(async () => {
  // Global cleanup
  console.log('🧹 Integration test cleanup complete');
});