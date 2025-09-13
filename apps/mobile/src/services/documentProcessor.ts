import { RustBridge } from './rustBridge';
import CameraService, { DocumentScanResult } from './cameraService';
import * as FileSystem from 'expo-file-system';

export interface ProcessedDocument {
  id: string;
  title: string;
  content: string;
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
    start?: number;
    end?: number;
  }>;
  metadata: {
    pageCount: number;
    language: string;
    processingTime: number;
    imageSize: { width: number; height: number };
    fileSize: number;
    ocrConfidence: number;
    scanQuality: 'low' | 'medium' | 'high';
  };
  images: Array<{
    uri: string;
    thumbnail: string;
    pageNumber: number;
  }>;
  originalScanResult: DocumentScanResult;
}

export interface ProcessingOptions {
  extractEntities: boolean;
  generateThumbnails: boolean;
  saveOriginal: boolean;
  languageHint?: string;
  enhanceText: boolean;
}

export class DocumentProcessor {
  private static instance: DocumentProcessor;
  private rustBridge: RustBridge;
  private cameraService: CameraService;

  private constructor() {
    this.rustBridge = RustBridge.getInstance();
    this.cameraService = CameraService.getInstance();
  }

  static getInstance(): DocumentProcessor {
    if (!DocumentProcessor.instance) {
      DocumentProcessor.instance = new DocumentProcessor();
    }
    return DocumentProcessor.instance;
  }

  async processDocument(
    scanResult: DocumentScanResult,
    options: Partial<ProcessingOptions> = {}
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();
    
    const processingOptions: ProcessingOptions = {
      extractEntities: true,
      generateThumbnails: true,
      saveOriginal: true,
      enhanceText: true,
      ...options,
    };

    try {
      // Validate image for OCR
      const validation = await this.cameraService.validateImageForOCR(scanResult.uri);
      if (!validation.isValid) {
        console.warn('Image validation issues:', validation.issues);
      }

      // Perform OCR
      const ocrResult = await this.rustBridge.scanDocument(scanResult.uri);
      
      // Extract additional entities if requested
      let allEntities = ocrResult.entities;
      if (processingOptions.extractEntities) {
        const additionalEntities = await this.rustBridge.extractEntities(ocrResult.text);
        
        // Merge and deduplicate entities
        const entityMap = new Map();
        
        // Add OCR entities
        ocrResult.entities.forEach(entity => {
          const key = `${entity.type}:${entity.value.toLowerCase()}`;
          if (!entityMap.has(key) || entityMap.get(key).confidence < entity.confidence) {
            entityMap.set(key, entity);
          }
        });
        
        // Add NLP entities
        additionalEntities.forEach(entity => {
          const key = `${entity.type}:${entity.value.toLowerCase()}`;
          const ocrEntity = {
            type: entity.type,
            value: entity.value,
            confidence: entity.confidence,
          };
          
          if (!entityMap.has(key) || entityMap.get(key).confidence < entity.confidence) {
            entityMap.set(key, ocrEntity);
          }
        });
        
        allEntities = Array.from(entityMap.values());
      }

      // Enhance text quality if requested
      let finalText = ocrResult.text;
      if (processingOptions.enhanceText) {
        finalText = await this.enhanceTextQuality(ocrResult.text);
      }

      // Generate document title
      const title = this.generateDocumentTitle(finalText);

      // Generate thumbnail if requested
      let thumbnail = scanResult.uri;
      if (processingOptions.generateThumbnails) {
        thumbnail = await this.generateThumbnail(scanResult.uri);
      }

      // Calculate metadata
      const fileInfo = await FileSystem.getInfoAsync(scanResult.uri);
      const processingTime = Date.now() - startTime;
      
      const processedDocument: ProcessedDocument = {
        id: this.generateDocumentId(),
        title,
        content: finalText,
        entities: allEntities,
        metadata: {
          pageCount: ocrResult.metadata.pageCount || 1,
          language: ocrResult.metadata.language || 'en',
          processingTime,
          imageSize: {
            width: scanResult.width,
            height: scanResult.height,
          },
          fileSize: fileInfo.exists && fileInfo.size ? fileInfo.size : 0,
          ocrConfidence: this.calculateOCRConfidence(ocrResult.text, allEntities),
          scanQuality: this.assessScanQuality(scanResult, ocrResult),
        },
        images: [
          {
            uri: scanResult.uri,
            thumbnail,
            pageNumber: 1,
          },
        ],
        originalScanResult: scanResult,
      };

      // Save original if requested
      if (processingOptions.saveOriginal) {
        const savedUri = await this.saveOriginalImage(scanResult.uri, processedDocument.id);
        processedDocument.images[0].uri = savedUri;
      }

      return processedDocument;
    } catch (error) {
      console.error('Error processing document:', error);
      throw new Error('Failed to process document');
    }
  }

  async processBatchDocuments(
    scanResults: DocumentScanResult[],
    options: Partial<ProcessingOptions> = {},
    onProgress?: (current: number, total: number) => void
  ): Promise<ProcessedDocument[]> {
    const results: ProcessedDocument[] = [];

    try {
      for (let i = 0; i < scanResults.length; i++) {
        onProgress?.(i + 1, scanResults.length);
        
        const result = await this.processDocument(scanResults[i], options);
        results.push(result);
      }

      // If multiple pages, combine them into a single document
      if (results.length > 1) {
        return [await this.combineMultiPageDocument(results)];
      }

      return results;
    } catch (error) {
      console.error('Error processing batch documents:', error);
      throw new Error('Failed to process batch documents');
    }
  }

  private async enhanceTextQuality(text: string): Promise<string> {
    try {
      // Apply text corrections and enhancements
      let enhanced = text;

      // Fix common OCR errors
      enhanced = this.fixCommonOCRErrors(enhanced);
      
      // Normalize whitespace
      enhanced = enhanced.replace(/\s+/g, ' ').trim();
      
      // Fix line breaks
      enhanced = enhanced.replace(/([a-z])-\s*\n\s*([a-z])/g, '$1$2');
      enhanced = enhanced.replace(/
\s*
\s*/g, '

');

      return enhanced;
    } catch (error) {
      console.error('Error enhancing text quality:', error);
      return text;
    }
  }

  private fixCommonOCRErrors(text: string): string {
    // Common OCR error corrections
    const corrections = [
      [/\b0\b/g, 'O'], // Zero to O
      [/\bl\b/g, 'I'], // lowercase l to I
      [/rn/g, 'm'], // rn to m
      [/\s+/g, ' '], // Multiple spaces to single space
      [/([.!?])\s*([A-Z])/g, '$1 $2'], // Ensure space after sentence endings
    ];

    let corrected = text;
    corrections.forEach(([pattern, replacement]) => {
      corrected = corrected.replace(pattern, replacement as string);
    });

    return corrected;
  }

  private generateDocumentTitle(text: string): string {
    // Extract potential title from document content
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      return 'Scanned Document';
    }

    // Try to find a title-like line
    for (const line of lines.slice(0, 5)) { // Check first 5 lines
      // Look for lines that might be titles
      if (line.length > 5 && line.length < 80) {
        // Check if it looks like a title (not all caps, not too long)
        const words = line.split(/\s+/);
        const capitalizedWords = words.filter(word => 
          word.length > 0 && word[0] === word[0].toUpperCase()
        );
        
        if (capitalizedWords.length >= words.length / 2) {
          return line;
        }
      }
    }

    // Fallback to first line or words
    const firstLine = lines[0];
    if (firstLine.length > 50) {
      // Take first few words
      const words = firstLine.split(/\s+/).slice(0, 6);
      return words.join(' ') + '...';
    }

    return firstLine || 'Scanned Document';
  }

  private async generateThumbnail(imageUri: string): Promise<string> {
    try {
      // Create a smaller version of the image for thumbnails
      const { ImageManipulator } = await import('expo-image-manipulator');
      
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 200 } }], // 200px wide thumbnail
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return result.uri;
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      return imageUri; // Return original if thumbnail generation fails
    }
  }

  private calculateOCRConfidence(text: string, entities: any[]): number {
    // Calculate overall confidence based on text quality and entity detection
    let confidence = 0.5; // Base confidence

    // Boost confidence based on text characteristics
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const validWords = words.filter(word => /^[A-Za-z]+$/.test(word));
    const wordRatio = words.length > 0 ? validWords.length / words.length : 0;
    
    confidence += wordRatio * 0.3;

    // Boost confidence based on entity detection
    if (entities.length > 0) {
      const avgEntityConfidence = entities.reduce((sum, entity) => sum + entity.confidence, 0) / entities.length;
      confidence += avgEntityConfidence * 0.2;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  private assessScanQuality(scanResult: DocumentScanResult, ocrResult: any): 'low' | 'medium' | 'high' {
    let score = 0;

    // Check image resolution
    const pixelCount = scanResult.width * scanResult.height;
    if (pixelCount > 2000000) score += 2; // > 2MP
    else if (pixelCount > 1000000) score += 1; // > 1MP

    // Check if document edges were detected
    if (scanResult.corners && scanResult.corners.length === 4) {
      score += 1;
    }

    // Check OCR text quality
    const textLength = ocrResult.text.length;
    if (textLength > 1000) score += 2;
    else if (textLength > 100) score += 1;

    // Check entity detection
    if (ocrResult.entities.length > 5) score += 1;

    // Convert score to quality rating
    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  private async saveOriginalImage(imageUri: string, documentId: string): Promise<string> {
    try {
      const filename = `document_${documentId}_original.jpg`;
      return await this.cameraService.saveToDocuments(imageUri, filename);
    } catch (error) {
      console.error('Error saving original image:', error);
      return imageUri;
    }
  }

  private async combineMultiPageDocument(documents: ProcessedDocument[]): Promise<ProcessedDocument> {
    // Combine multiple single-page documents into one multi-page document
    const firstDoc = documents[0];
    
    const combinedContent = documents
      .map((doc, index) => `--- Page ${index + 1} ---\n${doc.content}`)
      .join('\n\n');

    const combinedEntities = documents.reduce((all, doc) => {
      return [...all, ...doc.entities];
    }, [] as ProcessedDocument['entities']);

    // Deduplicate entities
    const entityMap = new Map();
    combinedEntities.forEach(entity => {
      const key = `${entity.type}:${entity.value.toLowerCase()}`;
      if (!entityMap.has(key) || entityMap.get(key).confidence < entity.confidence) {
        entityMap.set(key, entity);
      }
    });

    const allImages = documents.reduce((images, doc) => {
      return [...images, ...doc.images.map((img, idx) => ({
        ...img,
        pageNumber: images.length + idx + 1,
      }))];
    }, [] as ProcessedDocument['images']);

    return {
      ...firstDoc,
      title: `${firstDoc.title} (${documents.length} pages)`,
      content: combinedContent,
      entities: Array.from(entityMap.values()),
      metadata: {
        ...firstDoc.metadata,
        pageCount: documents.length,
        processingTime: documents.reduce((sum, doc) => sum + doc.metadata.processingTime, 0),
      },
      images: allImages,
    };
  }

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  async exportDocument(document: ProcessedDocument, format: 'pdf' | 'txt' | 'json'): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${document.title.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}`;

      switch (format) {
        case 'pdf':
          // Create PDF from images
          const imageUris = document.images.map(img => img.uri);
          return await this.cameraService.createPDF(imageUris, `${filename}.pdf`);

        case 'txt':
          // Export as plain text
          const textContent = `${document.title}\n${'='.repeat(document.title.length)}\n\n${document.content}`;
          const textUri = `${FileSystem.documentDirectory}${filename}.txt`;
          await FileSystem.writeAsStringAsync(textUri, textContent);
          return textUri;

        case 'json':
          // Export as JSON with all metadata
          const jsonContent = JSON.stringify(document, null, 2);
          const jsonUri = `${FileSystem.documentDirectory}${filename}.json`;
          await FileSystem.writeAsStringAsync(jsonUri, jsonContent);
          return jsonUri;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      console.error('Error exporting document:', error);
      throw new Error('Failed to export document');
    }
  }
}

export default DocumentProcessor;