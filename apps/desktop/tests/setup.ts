import '@testing-library/jest-dom';
import { server } from './mocks/server';

// Mock Electron APIs
global.window.electronAPI = {
  openFile: jest.fn(),
  saveFile: jest.fn(),
  showMessage: jest.fn(),
  onFileWatchUpdate: jest.fn(),
  removeFileWatcher: jest.fn(),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  searchDocuments: jest.fn(),
  getSystemInfo: jest.fn(() => Promise.resolve({
    platform: 'test',
    version: '1.0.0',
    arch: 'x64'
  }))
};

// Setup MSW for API mocking
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());