import React, { useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Searchbar,
  Chip,
  FAB,
  Menu,
  IconButton,
  Button,
  Divider,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/app';
import { trpc } from '../services/trpc';
import { format } from 'date-fns';

interface Document {
  id: string;
  title: string;
  content: string;
  fileType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  isFavorite: boolean;
  summary: string;
  entityCount: number;
}

export default function DocumentsScreen() {
  const router = useRouter();
  const { favoriteDocuments, toggleFavoriteDocument, addRecentDocument } = useAppStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'favorites' | 'recent'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  // Get documents from API
  const documentsQuery = trpc.documents.getAll.useQuery({
    search: searchQuery,
    sortBy,
    sortOrder,
    limit: 50,
  });

  const deleteDocumentMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      documentsQuery.refetch();
    },
  });

  const documents = documentsQuery.data?.data || [];

  // Filter documents based on selected filter
  const filteredDocuments = documents.filter(doc => {
    switch (filterType) {
      case 'favorites':
        return favoriteDocuments.includes(doc.id);
      case 'recent':
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return new Date(doc.updatedAt) > oneWeekAgo;
      default:
        return true;
    }
  });

  const handleDocumentPress = (doc: Document) => {
    addRecentDocument(doc.id);
    router.push(`/document/${doc.id}`);
  };

  const handleFavoriteToggle = (docId: string) => {
    toggleFavoriteDocument(docId);
  };

  const handleDeleteDocument = (docId: string) => {
    deleteDocumentMutation.mutate({ id: docId });
    setSelectedDoc(null);
  };

  const renderDocument = ({ item }: { item: Document }) => (
    <Card style={styles.documentCard} onPress={() => handleDocumentPress(item)}>
      <Card.Content>
        <View style={styles.documentHeader}>
          <View style={styles.documentInfo}>
            <View style={styles.titleRow}>
              <Ionicons 
                name={getDocumentIcon(item.fileType)} 
                size={20} 
                color="#6366F1" 
                style={styles.documentIcon}
              />
              <Title style={styles.documentTitle} numberOfLines={1}>
                {item.title}
              </Title>
            </View>
            
            <Paragraph style={styles.documentSummary} numberOfLines={2}>
              {item.summary || 'No summary available'}
            </Paragraph>
            
            <View style={styles.documentMeta}>
              <Paragraph style={styles.metaText}>
                {formatFileSize(item.size)} • {format(new Date(item.updatedAt), 'MMM d, yyyy')}
              </Paragraph>
              {item.entityCount > 0 && (
                <Chip style={styles.entityChip} textStyle={styles.chipText}>
                  {item.entityCount} entities
                </Chip>
              )}
            </View>

            {item.tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {item.tags.slice(0, 3).map((tag, index) => (
                  <Chip key={index} style={styles.tagChip} textStyle={styles.tagText}>
                    {tag}
                  </Chip>
                ))}
                {item.tags.length > 3 && (
                  <Chip style={styles.tagChip} textStyle={styles.tagText}>
                    +{item.tags.length - 3}
                  </Chip>
                )}
              </View>
            )}
          </View>

          <View style={styles.documentActions}>
            <IconButton
              icon={favoriteDocuments.includes(item.id) ? "heart" : "heart-outline"}
              iconColor={favoriteDocuments.includes(item.id) ? "#EF4444" : "#64748B"}
              size={20}
              onPress={() => handleFavoriteToggle(item.id)}
            />
            
            <Menu
              visible={menuVisible && selectedDoc === item.id}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  size={20}
                  onPress={() => {
                    setSelectedDoc(item.id);
                    setMenuVisible(true);
                  }}
                />
              }
            >
              <Menu.Item
                leadingIcon="share-variant"
                onPress={() => {
                  // TODO: Implement sharing
                  setMenuVisible(false);
                }}
                title="Share"
              />
              <Menu.Item
                leadingIcon="pencil"
                onPress={() => {
                  // TODO: Implement editing
                  setMenuVisible(false);
                }}
                title="Edit"
              />
              <Divider />
              <Menu.Item
                leadingIcon="delete"
                onPress={() => handleDeleteDocument(item.id)}
                title="Delete"
                titleStyle={{ color: '#EF4444' }}
              />
            </Menu>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={64} color="#94A3B8" />
      <Title style={styles.emptyTitle}>
        {filterType === 'favorites' ? 'No favorite documents' : 
         filterType === 'recent' ? 'No recent documents' : 
         'No documents yet'}
      </Title>
      <Paragraph style={styles.emptyText}>
        {filterType === 'all' 
          ? 'Start by scanning or uploading your first document'
          : `No ${filterType} documents found`}
      </Paragraph>
      {filterType === 'all' && (
        <Button
          mode="contained"
          onPress={() => router.push('/scanner')}
          style={styles.emptyButton}
        >
          Scan Document
        </Button>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search and Filter Header */}
      <View style={styles.header}>
        <Searchbar
          placeholder="Search documents..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          icon={() => <Ionicons name="search" size={20} />}
        />
        
        <View style={styles.filterRow}>
          <View style={styles.filterChips}>
            {(['all', 'favorites', 'recent'] as const).map((filter) => (
              <Chip
                key={filter}
                selected={filterType === filter}
                onPress={() => setFilterType(filter)}
                style={styles.filterChip}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Chip>
            ))}
          </View>
          
          <Menu
            visible={menuVisible && selectedDoc === 'sort'}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <IconButton
                icon="sort"
                size={24}
                onPress={() => {
                  setSelectedDoc('sort');
                  setMenuVisible(true);
                }}
              />
            }
          >
            <Menu.Item
              leadingIcon="calendar"
              onPress={() => {
                setSortBy('date');
                setMenuVisible(false);
              }}
              title="Sort by Date"
              trailingIcon={sortBy === 'date' ? 'check' : undefined}
            />
            <Menu.Item
              leadingIcon="alphabetical"
              onPress={() => {
                setSortBy('name');
                setMenuVisible(false);
              }}
              title="Sort by Name"
              trailingIcon={sortBy === 'name' ? 'check' : undefined}
            />
            <Menu.Item
              leadingIcon="file-outline"
              onPress={() => {
                setSortBy('size');
                setMenuVisible(false);
              }}
              title="Sort by Size"
              trailingIcon={sortBy === 'size' ? 'check' : undefined}
            />
            <Divider />
            <Menu.Item
              leadingIcon={sortOrder === 'asc' ? 'sort-ascending' : 'sort-descending'}
              onPress={() => {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                setMenuVisible(false);
              }}
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            />
          </Menu>
        </View>
      </View>

      {/* Documents List */}
      <FlatList
        data={filteredDocuments}
        renderItem={renderDocument}
        keyExtractor={(item) => item.id}
        style={styles.documentsList}
        contentContainerStyle={filteredDocuments.length === 0 ? styles.emptyContainer : undefined}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={documentsQuery.isLoading}
            onRefresh={() => documentsQuery.refetch()}
          />
        }
        ListEmptyComponent={renderEmptyState}
      />

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/scanner')}
        label="Add"
      />
    </View>
  );
}

function getDocumentIcon(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case 'pdf': return 'document-text';
    case 'doc':
    case 'docx': return 'file-word';
    case 'txt': return 'document-text-outline';
    case 'jpg':
    case 'jpeg':
    case 'png': return 'image';
    case 'mp3':
    case 'wav': return 'music';
    case 'mp4':
    case 'avi': return 'video';
    default: return 'document';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: 'white',
    padding: 16,
    elevation: 2,
  },
  searchBar: {
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterChips: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  filterChip: {
    height: 32,
  },
  documentsList: {
    flex: 1,
    padding: 16,
  },
  documentCard: {
    marginBottom: 12,
    elevation: 1,
  },
  documentHeader: {
    flexDirection: 'row',
  },
  documentInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  documentIcon: {
    marginRight: 8,
  },
  documentTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  documentSummary: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
    lineHeight: 20,
  },
  documentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  entityChip: {
    height: 24,
  },
  chipText: {
    fontSize: 10,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tagChip: {
    height: 24,
    marginRight: 0,
  },
  tagText: {
    fontSize: 10,
  },
  documentActions: {
    flexDirection: 'column',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    marginBottom: 24,
  },
  emptyButton: {
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6366F1',
  },
});