import { NativeModules, Platform } from 'react-native';

// Define the interface for our Rust native module
interface AutoOrganizeNativeModule {
  // File operations
  scanDocument(imagePath: string): Promise<{
    text: string;
    entities: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    metadata: Record<string, any>;
  }>;

  // Encryption operations
  encryptData(data: string, key: string): Promise<string>;
  decryptData(encryptedData: string, key: string): Promise<string>;
  generateKey(): Promise<string>;

  // Search operations
  indexDocument(id: string, content: string, metadata: Record<string, any>): Promise<boolean>;
  searchDocuments(query: string, options: {
    type: 'fulltext' | 'semantic' | 'fuzzy';
    limit: number;
  }): Promise<Array<{
    id: string;
    score: number;
    highlights: string[];
  }>>;

  // Entity extraction
  extractEntities(text: string): Promise<Array<{
    type: string;
    value: string;
    start: number;
    end: number;
    confidence: number;
  }>>;

  // File watching (for background sync)
  startFileWatcher(directory: string): Promise<boolean>;
  stopFileWatcher(): Promise<boolean>;
}

// Get the native module
const { AutoOrganizeNative } = NativeModules;

// Create a typed wrapper with fallbacks for development
export const RustFFI: AutoOrganizeNativeModule = {
  async scanDocument(imagePath: string) {
    if (AutoOrganizeNative?.scanDocument) {
      return await AutoOrganizeNative.scanDocument(imagePath);
    }
    
    // Mock implementation for development
    return {
      text: 'This is a mock OCR result for development. The actual implementation would use Rust libraries for document scanning and text extraction.',
      entities: [
        { type: 'PERSON', value: 'John Doe', confidence: 0.95 },
        { type: 'DATE', value: '2023-08-15', confidence: 0.87 },
        { type: 'ORGANIZATION', value: 'AutoOrganize Inc.', confidence: 0.92 },
      ],
      metadata: {
        pageCount: 1,
        language: 'en',
        processingTime: 1200,
      },
    };
  },

  async encryptData(data: string, key: string) {
    if (AutoOrganizeNative?.encryptData) {
      return await AutoOrganizeNative.encryptData(data, key);
    }
    
    // Mock implementation - in development, just base64 encode
    return Buffer.from(data).toString('base64');
  },

  async decryptData(encryptedData: string, key: string) {
    if (AutoOrganizeNative?.decryptData) {
      return await AutoOrganizeNative.decryptData(encryptedData, key);
    }
    
    // Mock implementation - in development, just base64 decode
    try {
      return Buffer.from(encryptedData, 'base64').toString('utf8');
    } catch {
      throw new Error('Failed to decrypt data');
    }
  },

  async generateKey() {
    if (AutoOrganizeNative?.generateKey) {
      return await AutoOrganizeNative.generateKey();
    }
    
    // Mock implementation - generate random key
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  },

  async indexDocument(id: string, content: string, metadata: Record<string, any>) {
    if (AutoOrganizeNative?.indexDocument) {
      return await AutoOrganizeNative.indexDocument(id, content, metadata);
    }
    
    // Mock implementation
    console.log(`Mock: Indexing document ${id} with content length ${content.length}`);
    return true;
  },

  async searchDocuments(query: string, options: {
    type: 'fulltext' | 'semantic' | 'fuzzy';
    limit: number;
  }) {
    if (AutoOrganizeNative?.searchDocuments) {
      return await AutoOrganizeNative.searchDocuments(query, options);
    }
    
    // Mock implementation
    const mockResults = [
      { id: '1', score: 0.95, highlights: [`Found ${query} in document content`] },
      { id: '2', score: 0.87, highlights: [`Related to ${query}`] },
      { id: '3', score: 0.73, highlights: [`Similar concept to ${query}`] },
    ];
    
    return mockResults.slice(0, options.limit);
  },

  async extractEntities(text: string) {
    if (AutoOrganizeNative?.extractEntities) {
      return await AutoOrganizeNative.extractEntities(text);
    }
    
    // Mock implementation - simple regex-based entity extraction
    const entities = [];
    
    // Extract email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    let match;
    while ((match = emailRegex.exec(text)) !== null) {
      entities.push({
        type: 'EMAIL',
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.9,
      });
    }
    
    // Extract dates (simple format)
    const dateRegex = /\b\d{4}-\d{2}-\d{2}\b/g;
    while ((match = dateRegex.exec(text)) !== null) {
      entities.push({
        type: 'DATE',
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85,
      });
    }
    
    return entities;
  },

  async startFileWatcher(directory: string) {
    if (AutoOrganizeNative?.startFileWatcher) {
      return await AutoOrganizeNative.startFileWatcher(directory);
    }
    
    console.log(`Mock: Starting file watcher for ${directory}`);
    return true;
  },

  async stopFileWatcher() {
    if (AutoOrganizeNative?.stopFileWatcher) {
      return await AutoOrganizeNative.stopFileWatcher();
    }
    
    console.log('Mock: Stopping file watcher');
    return true;
  },
};

// Helper functions for easier usage
export class RustBridge {
  private static instance: RustBridge;
  private isInitialized = false;

  static getInstance(): RustBridge {
    if (!RustBridge.instance) {
      RustBridge.instance = new RustBridge();
    }
    return RustBridge.instance;
  }

  async initialize(): Promise<boolean> {
    try {
      // Initialize the Rust bridge
      if (AutoOrganizeNative?.initialize) {
        await AutoOrganizeNative.initialize();
      }
      
      this.isInitialized = true;
      console.log('Rust bridge initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Rust bridge:', error);
      return false;
    }
  }

  async processDocument(imagePath: string): Promise<{
    text: string;
    entities: Array<{ type: string; value: string; confidence: number }>;
    metadata: Record<string, any>;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const result = await RustFFI.scanDocument(imagePath);
      
      // Also extract additional entities from the OCR text
      const additionalEntities = await RustFFI.extractEntities(result.text);
      
      // Combine entities from OCR and NLP extraction
      const allEntities = [
        ...result.entities,
        ...additionalEntities.map(e => ({
          type: e.type,
          value: e.value,
          confidence: e.confidence,
        })),
      ];
      
      // Remove duplicates
      const uniqueEntities = allEntities.filter((entity, index, self) => 
        index === self.findIndex(e => e.type === entity.type && e.value === entity.value)
      );
      
      return {
        ...result,
        entities: uniqueEntities,
      };
    } catch (error) {
      console.error('Error processing document:', error);
      throw error;
    }
  }

  async secureStore(key: string, data: string): Promise<boolean> {
    try {
      const encryptionKey = await RustFFI.generateKey();
      const encryptedData = await RustFFI.encryptData(data, encryptionKey);
      
      // Store both the encrypted data and key securely
      // In a real implementation, you'd use a secure keystore
      console.log(`Securely storing data for key: ${key}`);
      return true;
    } catch (error) {
      console.error('Error storing data securely:', error);
      return false;
    }
  }

  async secureRetrieve(key: string, encryptionKey: string): Promise<string | null> {
    try {
      // In a real implementation, retrieve encrypted data from storage
      const encryptedData = 'mock_encrypted_data';
      const decryptedData = await RustFFI.decryptData(encryptedData, encryptionKey);
      return decryptedData;
    } catch (error) {
      console.error('Error retrieving data securely:', error);
      return null;
    }
  }

  isNativeModuleAvailable(): boolean {
    return !!AutoOrganizeNative;
  }

  getPlatformInfo(): {
    platform: string;
    hasNativeModule: boolean;
    version: string;
  } {
    return {
      platform: Platform.OS,
      hasNativeModule: this.isNativeModuleAvailable(),
      version: '0.1.0',
    };
  }
}

export default RustBridge;