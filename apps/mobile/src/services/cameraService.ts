import { Camera, CameraType, FlashMode } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

export interface DocumentScanResult {
  uri: string;
  width: number;
  height: number;
  base64?: string;
  corners?: Array<{ x: number; y: number }>;
}

export interface ScanOptions {
  quality: number;
  detectEdges: boolean;
  autoCorrect: boolean;
  format: 'jpeg' | 'png';
}

export class CameraService {
  private static instance: CameraService;

  static getInstance(): CameraService {
    if (!CameraService.instance) {
      CameraService.instance = new CameraService();
    }
    return CameraService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  }

  async captureDocument(
    cameraRef: React.RefObject<Camera>,
    options: Partial<ScanOptions> = {}
  ): Promise<DocumentScanResult | null> {
    if (!cameraRef.current) {
      throw new Error('Camera reference is not available');
    }

    const scanOptions: ScanOptions = {
      quality: 1,
      detectEdges: true,
      autoCorrect: true,
      format: 'jpeg',
      ...options,
    };

    try {
      // Capture the photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: scanOptions.quality,
        base64: false,
        exif: false,
        skipProcessing: false,
      });

      // Process the captured image
      const processedImage = await this.processDocumentImage(photo.uri, scanOptions);
      
      return processedImage;
    } catch (error) {
      console.error('Error capturing document:', error);
      throw new Error('Failed to capture document');
    }
  }

  private async processDocumentImage(
    imageUri: string,
    options: ScanOptions
  ): Promise<DocumentScanResult> {
    try {
      // Get image info
      const imageInfo = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      let processedUri = imageInfo.uri;
      let corners: Array<{ x: number; y: number }> | undefined;

      // Auto-detect document edges if requested
      if (options.detectEdges) {
        const edgeDetectionResult = await this.detectDocumentEdges(imageUri);
        if (edgeDetectionResult.corners) {
          corners = edgeDetectionResult.corners;
          
          // Apply perspective correction if we have corners and auto-correct is enabled
          if (options.autoCorrect && corners.length === 4) {
            processedUri = await this.applyPerspectiveCorrection(imageUri, corners);
          }
        }
      }

      // Enhance image quality
      processedUri = await this.enhanceImageQuality(processedUri);

      // Get final image dimensions
      const finalInfo = await FileSystem.getInfoAsync(processedUri);
      const imageSize = await this.getImageDimensions(processedUri);

      return {
        uri: processedUri,
        width: imageSize.width,
        height: imageSize.height,
        corners,
      };
    } catch (error) {
      console.error('Error processing document image:', error);
      throw new Error('Failed to process document image');
    }
  }

  private async detectDocumentEdges(imageUri: string): Promise<{
    corners?: Array<{ x: number; y: number }>;
    confidence: number;
  }> {
    // In a real implementation, this would use computer vision libraries
    // For now, return mock corner detection
    
    try {
      const imageSize = await this.getImageDimensions(imageUri);
      
      // Mock document detection - assume document takes up 80% of the image
      const margin = 0.1;
      const corners = [
        { x: imageSize.width * margin, y: imageSize.height * margin },
        { x: imageSize.width * (1 - margin), y: imageSize.height * margin },
        { x: imageSize.width * (1 - margin), y: imageSize.height * (1 - margin) },
        { x: imageSize.width * margin, y: imageSize.height * (1 - margin) },
      ];

      return {
        corners,
        confidence: 0.85, // Mock confidence score
      };
    } catch (error) {
      console.error('Error detecting document edges:', error);
      return { confidence: 0 };
    }
  }

  private async applyPerspectiveCorrection(
    imageUri: string,
    corners: Array<{ x: number; y: number }>
  ): Promise<string> {
    try {
      // In a real implementation, this would apply perspective transformation
      // For now, just crop to a rectangle based on the corners
      
      const imageSize = await this.getImageDimensions(imageUri);
      
      // Find bounding rectangle of the corners
      const minX = Math.min(...corners.map(c => c.x));
      const maxX = Math.max(...corners.map(c => c.x));
      const minY = Math.min(...corners.map(c => c.y));
      const maxY = Math.max(...corners.map(c => c.y));
      
      const cropWidth = maxX - minX;
      const cropHeight = maxY - minY;
      
      // Normalize coordinates
      const originX = minX / imageSize.width;
      const originY = minY / imageSize.height;
      const cropWidthRatio = cropWidth / imageSize.width;
      const cropHeightRatio = cropHeight / imageSize.height;

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX,
              originY,
              width: cropWidthRatio,
              height: cropHeightRatio,
            },
          },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return result.uri;
    } catch (error) {
      console.error('Error applying perspective correction:', error);
      return imageUri; // Return original if correction fails
    }
  }

  private async enhanceImageQuality(imageUri: string): Promise<string> {
    try {
      // Apply image enhancements: contrast, sharpening, etc.
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Resize to optimal scanning resolution if too large
          { resize: { width: 2000 } }, // Max width 2000px
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return result.uri;
    } catch (error) {
      console.error('Error enhancing image quality:', error);
      return imageUri;
    }
  }

  private async getImageDimensions(imageUri: string): Promise<{ width: number; height: number }> {
    try {
      // Use ImageManipulator to get image info
      const imageInfo = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        { compress: 1 }
      );

      return {
        width: imageInfo.width,
        height: imageInfo.height,
      };
    } catch (error) {
      console.error('Error getting image dimensions:', error);
      return { width: 0, height: 0 };
    }
  }

  async convertToBase64(imageUri: string): Promise<string> {
    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (error) {
      console.error('Error converting to base64:', error);
      throw new Error('Failed to convert image to base64');
    }
  }

  async saveToDocuments(imageUri: string, filename: string): Promise<string> {
    try {
      const documentsDirectory = FileSystem.documentDirectory;
      if (!documentsDirectory) {
        throw new Error('Documents directory not available');
      }

      const savedUri = `${documentsDirectory}${filename}`;
      await FileSystem.copyAsync({
        from: imageUri,
        to: savedUri,
      });

      return savedUri;
    } catch (error) {
      console.error('Error saving to documents:', error);
      throw new Error('Failed to save image to documents');
    }
  }

  async createPDF(imageUris: string[], outputPath: string): Promise<string> {
    try {
      // In a real implementation, this would create a PDF from multiple images
      // For now, just return the first image URI as a placeholder
      
      if (imageUris.length === 0) {
        throw new Error('No images provided for PDF creation');
      }

      // Mock PDF creation - in reality, you'd use a library like react-native-pdf-lib
      console.log(`Mock: Creating PDF with ${imageUris.length} pages at ${outputPath}`);
      
      return imageUris[0]; // Return first image as placeholder
    } catch (error) {
      console.error('Error creating PDF:', error);
      throw new Error('Failed to create PDF');
    }
  }

  async batchScan(
    cameraRef: React.RefObject<Camera>,
    pageCount: number,
    options: Partial<ScanOptions> = {},
    onProgress?: (current: number, total: number) => void
  ): Promise<DocumentScanResult[]> {
    const results: DocumentScanResult[] = [];

    try {
      for (let i = 0; i < pageCount; i++) {
        onProgress?.(i + 1, pageCount);
        
        // In a real implementation, you'd prompt the user to position the next page
        // For now, we'll just capture immediately
        
        const result = await this.captureDocument(cameraRef, options);
        if (result) {
          results.push(result);
        }

        // Add a small delay between captures
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return results;
    } catch (error) {
      console.error('Error in batch scan:', error);
      throw new Error('Batch scan failed');
    }
  }

  getCameraConstraints(quality: 'low' | 'medium' | 'high') {
    switch (quality) {
      case 'low':
        return {
          width: 640,
          height: 480,
          quality: 0.3,
        };
      case 'medium':
        return {
          width: 1280,
          height: 720,
          quality: 0.7,
        };
      case 'high':
        return {
          width: 1920,
          height: 1080,
          quality: 1.0,
        };
      default:
        return {
          width: 1280,
          height: 720,
          quality: 0.7,
        };
    }
  }

  async validateImageForOCR(imageUri: string): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check image size
      const dimensions = await this.getImageDimensions(imageUri);
      
      if (dimensions.width < 640 || dimensions.height < 480) {
        issues.push('Image resolution is too low');
        recommendations.push('Use higher camera quality setting');
      }

      if (dimensions.width > 4000 || dimensions.height > 4000) {
        recommendations.push('Consider reducing image size for faster processing');
      }

      // Check file size
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (fileInfo.exists && fileInfo.size) {
        const sizeMB = fileInfo.size / (1024 * 1024);
        
        if (sizeMB > 10) {
          issues.push('Image file size is very large');
          recommendations.push('Reduce image quality to improve processing speed');
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
        recommendations,
      };
    } catch (error) {
      console.error('Error validating image:', error);
      return {
        isValid: false,
        issues: ['Failed to validate image'],
        recommendations: ['Try capturing the image again'],
      };
    }
  }
}

export default CameraService;