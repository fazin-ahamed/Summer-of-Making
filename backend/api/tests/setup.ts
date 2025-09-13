import { beforeAll, afterAll, afterEach } from '@jest/globals';
import nock from 'nock';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = ':memory:';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.NEO4J_URI = 'bolt://localhost:7687';
  process.env.LOG_LEVEL = 'error';
});

afterAll(async () => {
  // Cleanup after all tests
  nock.cleanAll();
});

afterEach(() => {
  // Clean up after each test
  nock.cleanAll();
  jest.clearAllMocks();
});

// Extend Jest matchers
expect.extend({
  toBeValidDate(received: any) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid date`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidDate(): R;
    }
  }
}