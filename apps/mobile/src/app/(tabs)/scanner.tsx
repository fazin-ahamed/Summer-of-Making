import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  IconButton,
  Chip,
  ActivityIndicator,
} from 'react-native-paper';
import { Camera, CameraType, FlashMode } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/app';
import { RustBridge } from '../services/rustBridge';
import CameraService from '../services/cameraService';
import DocumentProcessor from '../services/documentProcessor';
import { trpc } from '../services/trpc';

export default function ScannerScreen() {
  const router = useRouter();
  const { settings } = useAppStore();
  const cameraRef = useRef<Camera>(null);
  const cameraService = CameraService.getInstance();
  const documentProcessor = DocumentProcessor.getInstance();
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [type, setType] = useState(CameraType.back);
  const [flashMode, setFlashMode] = useState(FlashMode.off);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedDocument, setProcessedDocument] = useState<any | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: (data) => {
      router.push(`/document/${data.data.id}`);
    },
    onError: (error) => {
      Alert.alert('Upload Error', error.message);
    },
  });

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleTakePicture = async () => {
    if (!cameraRef.current) return;

    try {
      setIsProcessing(true);
      
      const scanOptions = {
        quality: settings.cameraQuality === 'high' ? 1 : settings.cameraQuality === 'medium' ? 0.7 : 0.5,
        detectEdges: true,
        autoCorrect: true,
        format: 'jpeg' as const,
      };

      // Capture document using camera service
      const scanResult = await cameraService.captureDocument(cameraRef, scanOptions);
      
      if (scanResult) {
        // Process the document
        const processed = await documentProcessor.processDocument(scanResult, {
          extractEntities: true,
          generateThumbnails: true,
          enhanceText: true,
        });
        
        setProcessedDocument(processed);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Camera Error', 'Failed to capture document');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        setIsProcessing(true);
        await processDocument(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Gallery Error', 'Failed to pick image');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'text/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setIsProcessing(true);
        await processDocument(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Document Error', 'Failed to pick document');
    }
  };

  const processDocument = async (uri: string) => {
    try {
      const rustBridge = RustBridge.getInstance();
      const result = await rustBridge.processDocument(uri);
      
      setProcessedDocument(result);
      setIsProcessing(false);
    } catch (error) {
      console.error('Error processing document:', error);
      Alert.alert('Processing Error', 'Failed to process document');
      setIsProcessing(false);
    }
  };

  const handleSaveDocument = async () => {
    if (!processedDocument) return;

    try {
      setIsProcessing(true);
      
      const uploadData = {
        title: extractTitle(processedDocument.text),
        content: processedDocument.text,
        fileType: 'scan',
        entities: processedDocument.entities,
        metadata: processedDocument.metadata,
      };

      await uploadMutation.mutateAsync(uploadData);
    } catch (error) {
      console.error('Error saving document:', error);
      setIsProcessing(false);
    }
  };

  const handleRetry = () => {
    setProcessedDocument(null);
    setIsProcessing(false);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" />
        <Paragraph style={styles.loadingText}>Requesting camera permission...</Paragraph>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="camera-off" size={64} color="#94A3B8" />
        <Title style={styles.permissionTitle}>No Camera Access</Title>
        <Paragraph style={styles.permissionText}>
          Camera permission is required to scan documents. Please enable it in your device settings.
        </Paragraph>
        <Button
          mode="contained"
          onPress={() => Camera.requestCameraPermissionsAsync()}
          style={styles.permissionButton}
        >
          Grant Permission
        </Button>
      </View>
    );
  }

  // Show processing results
  if (processedDocument) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <IconButton
            icon="arrow-left"
            size={24}
            onPress={handleRetry}
            style={styles.backButton}
          />
          <Title style={styles.headerTitle}>Review Scan</Title>
          <View style={styles.placeholder} />
        </View>

        <Card style={styles.resultCard}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Extracted Text</Title>
            <Paragraph style={styles.extractedText} numberOfLines={10}>
              {processedDocument.text}
            </Paragraph>

            {processedDocument.entities.length > 0 && (
              <View style={styles.entitiesSection}>
                <Title style={styles.sectionTitle}>Detected Entities</Title>
                <View style={styles.entitiesContainer}>
                  {processedDocument.entities.slice(0, 10).map((entity, index) => (
                    <Chip
                      key={index}
                      style={[styles.entityChip, { backgroundColor: getEntityColor(entity.type) }]}
                      textStyle={styles.entityText}
                    >
                      {entity.value} ({Math.round(entity.confidence * 100)}%)
                    </Chip>
                  ))}
                  {processedDocument.entities.length > 10 && (
                    <Chip style={styles.entityChip}>
                      +{processedDocument.entities.length - 10} more
                    </Chip>
                  )}
                </View>
              </View>
            )}

            <View style={styles.metadataSection}>
              <Title style={styles.sectionTitle}>Metadata</Title>
              <Paragraph style={styles.metadataText}>
                Language: {processedDocument.metadata.language || 'Unknown'}
              </Paragraph>
              {processedDocument.metadata.pageCount && (
                <Paragraph style={styles.metadataText}>
                  Pages: {processedDocument.metadata.pageCount}
                </Paragraph>
              )}
              <Paragraph style={styles.metadataText}>
                Processing Time: {processedDocument.metadata.processingTime}ms
              </Paragraph>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.actionButtons}>
          <Button
            mode="outlined"
            onPress={handleRetry}
            style={styles.actionButton}
            disabled={isProcessing}
          >
            Scan Again
          </Button>
          <Button
            mode="contained"
            onPress={handleSaveDocument}
            style={styles.actionButton}
            loading={isProcessing}
            disabled={isProcessing}
          >
            Save Document
          </Button>
        </View>
      </View>
    );
  }

  // Show processing indicator
  if (isProcessing) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Title style={styles.processingTitle}>Processing Document</Title>
        <Paragraph style={styles.processingText}>
          Extracting text and analyzing content...
        </Paragraph>
      </View>
    );
  }

  // Main camera view
  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        type={type}
        flashMode={flashMode}
        ratio="16:9"
      >
        <View style={styles.cameraOverlay}>
          {/* Header Controls */}
          <View style={styles.topControls}>
            <IconButton
              icon="arrow-left"
              iconColor="white"
              size={24}
              onPress={() => router.back()}
              style={styles.controlButton}
            />
            
            <View style={styles.topRightControls}>
              <IconButton
                icon={flashMode === FlashMode.off ? 'flash-off' : 'flash'}
                iconColor="white"
                size={24}
                onPress={() => setFlashMode(
                  flashMode === FlashMode.off ? FlashMode.on : FlashMode.off
                )}
                style={styles.controlButton}
              />
              
              <IconButton
                icon="camera-flip"
                iconColor="white"
                size={24}
                onPress={() => setType(
                  type === CameraType.back ? CameraType.front : CameraType.back
                )}
                style={styles.controlButton}
              />
            </View>
          </View>

          {/* Viewfinder Frame */}
          <View style={styles.viewfinderContainer}>
            <View style={styles.viewfinder}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Paragraph style={styles.instruction}>
              Position document within the frame
            </Paragraph>
          </View>

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            <IconButton
              icon="image"
              iconColor="white"
              size={32}
              onPress={handlePickFromGallery}
              style={styles.secondaryButton}
            />
            
            <IconButton
              icon="camera"
              iconColor="white"
              size={56}
              onPress={handleTakePicture}
              style={styles.captureButton}
            />
            
            <IconButton
              icon="file-document"
              iconColor="white"
              size={32}
              onPress={handlePickDocument}
              style={styles.secondaryButton}
            />
          </View>
        </View>
      </Camera>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Card style={styles.quickActionCard}>
          <Card.Content style={styles.quickActionContent}>
            <Ionicons name="scan" size={24} color="#6366F1" />
            <Paragraph style={styles.quickActionText}>
              Auto-detect and crop document boundaries
            </Paragraph>
          </Card.Content>
        </Card>
      </View>
    </View>
  );
}

function extractTitle(text: string): string {
  // Extract potential title from first few lines
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return 'Scanned Document';
  
  const firstLine = lines[0].trim();
  if (firstLine.length > 50) {
    return firstLine.substring(0, 47) + '...';
  }
  
  return firstLine || 'Scanned Document';
}

function getEntityColor(type: string): string {
  const colors = {
    PERSON: '#F59E0B20',
    ORGANIZATION: '#EF444420',
    DATE: '#06B6D420',
    EMAIL: '#8B5CF620',
    LOCATION: '#10B98120',
  };
  return colors[type as keyof typeof colors] || '#64748B20';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F8FAFC',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  topRightControls: {
    flexDirection: 'row',
  },
  controlButton: {
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  viewfinderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  viewfinder: {
    width: '100%',
    aspectRatio: 3/4,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'white',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  instruction: {
    color: 'white',
    textAlign: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 60,
    paddingHorizontal: 40,
  },
  captureButton: {
    backgroundColor: '#6366F1',
    borderWidth: 4,
    borderColor: 'white',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  quickActions: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  quickActionCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  quickActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  quickActionText: {
    marginLeft: 12,
    flex: 1,
    fontSize: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'white',
  },
  backButton: {
    margin: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  resultCard: {
    flex: 1,
    margin: 20,
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  extractedText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  entitiesSection: {
    marginTop: 16,
  },
  entitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  entityChip: {
    height: 28,
    marginRight: 0,
    marginBottom: 0,
  },
  entityText: {
    fontSize: 11,
  },
  metadataSection: {
    marginTop: 16,
  },
  metadataText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    backgroundColor: 'white',
  },
  actionButton: {
    flex: 1,
  },
  loadingText: {
    marginTop: 12,
    textAlign: 'center',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionText: {
    textAlign: 'center',
    color: '#64748B',
    marginBottom: 24,
  },
  permissionButton: {
    marginTop: 8,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  processingText: {
    textAlign: 'center',
    color: '#64748B',
  },
});