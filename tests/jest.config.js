module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    '../backend/api/src/**/*.{ts,js}',
    '../apps/desktop/src/**/*.{ts,tsx}',
    '../apps/mobile/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json'
  ],
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 60000, // Longer timeout for integration tests
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
  maxWorkers: 2, // Limit concurrent workers for integration tests
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/../$1',
    '^@autoorganize/(.*)$': '<rootDir>/../shared/$1'
  },
  globalSetup: '<rootDir>/globalSetup.ts',
  globalTeardown: '<rootDir>/globalTeardown.ts',
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage/html-report',
      filename: 'integration-test-report.html',
      expand: true
    }]
  ]
};