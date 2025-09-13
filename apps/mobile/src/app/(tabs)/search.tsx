import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, FlatList } from 'react-native';
import { 
  Searchbar, 
  Card, 
  Title, 
  Paragraph, 
  Chip, 
  Button,
  List,
  Divider,
  ActivityIndicator,
  IconButton
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/app';
import { trpc } from '../services/trpc';
import { useDebounce } from '../hooks/useDebounce';

interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: 'document' | 'entity' | 'note';
  fileType?: string;
  relevanceScore: number;
  highlights?: string[];
  metadata?: Record<string, any>;
}

export default function SearchScreen() {
  const router = useRouter();
  const { recentSearches, searchHistory, addRecentSearch, addSearchHistory } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'fulltext' | 'semantic' | 'fuzzy' | 'hybrid'>('hybrid');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  
  const debouncedQuery = useDebounce(searchQuery, 500);

  // Search API call
  const searchMutation = trpc.search.search.useMutation({
    onMutate: () => setIsSearching(true),
    onSettled: () => setIsSearching(false),
    onSuccess: (data) => {
      setResults(data.data?.results || []);
      if (searchQuery.trim()) {
        addSearchHistory({
          query: searchQuery.trim(),
          resultCount: data.data?.totalCount || 0,
        });
      }
    },
  });

  // Auto-complete suggestions
  const autoCompleteQuery = trpc.search.autoComplete.useQuery(
    { query: searchQuery, maxSuggestions: 5 },
    { enabled: searchQuery.length > 2 }
  );

  // Perform search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim()) {
      searchMutation.mutate({
        query: debouncedQuery,
        type: searchType,
        filters: {},
        pagination: { page: 1, limit: 20 },
        sortBy: 'relevance',
        sortOrder: 'desc',
      });
    } else {
      setResults([]);
    }
  }, [debouncedQuery, searchType]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    addRecentSearch(query);
  };

  const handleSuggestionPress = (suggestion: string) => {
    handleSearch(suggestion);
  };

  const renderSearchResult = ({ item }: { item: SearchResult }) => (
    <Card style={styles.resultCard}>
      <Card.Content>
        <View style={styles.resultHeader}>
          <View style={styles.resultInfo}>
            <Ionicons 
              name={getResultIcon(item.type, item.fileType)} 
              size={20} 
              color=\"#6366F1\" 
              style={styles.resultIcon}
            />
            <View style={styles.resultText}>
              <Title style={styles.resultTitle} numberOfLines={2}>
                {highlightText(item.title, searchQuery)}
              </Title>
              <Paragraph style={styles.resultContent} numberOfLines={3}>
                {highlightText(item.content, searchQuery)}
              </Paragraph>
            </View>
          </View>
          <View style={styles.resultMeta}>
            <Chip style={styles.typeChip} textStyle={styles.chipText}>
              {item.type}
            </Chip>
            <Paragraph style={styles.scoreText}>
              {Math.round(item.relevanceScore * 100)}% match
            </Paragraph>
          </View>
        </View>
        
        {item.highlights && item.highlights.length > 0 && (
          <View style={styles.highlightsContainer}>
            <Paragraph style={styles.highlightsTitle}>Highlights:</Paragraph>
            {item.highlights.slice(0, 2).map((highlight, index) => (
              <Paragraph key={index} style={styles.highlight}>
                \"...{highlight}...\"
              </Paragraph>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );

  const renderEmptyState = () => {
    if (searchQuery.trim() && !isSearching && results.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name=\"search-outline\" size={64} color=\"#94A3B8\" />
          <Title style={styles.emptyTitle}>No results found</Title>
          <Paragraph style={styles.emptyText}>
            Try adjusting your search terms or search type
          </Paragraph>
          <Button mode=\"outlined\" onPress={() => setSearchQuery('')}>
            Clear Search
          </Button>
        </View>
      );
    }

    return (
      <ScrollView style={styles.defaultContent}>
        {/* Search Type Selector */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Search Type</Title>
            <View style={styles.searchTypeContainer}>
              {(['fulltext', 'semantic', 'fuzzy', 'hybrid'] as const).map((type) => (
                <Chip
                  key={type}
                  selected={searchType === type}
                  onPress={() => setSearchType(type)}
                  style={styles.searchTypeChip}
                >
                  {type === 'fulltext' ? 'Full-text' : type.charAt(0).toUpperCase() + type.slice(1)}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.sectionTitle}>Recent Searches</Title>
              <View style={styles.recentSearches}>
                {recentSearches.slice(0, 8).map((search, index) => (
                  <Chip
                    key={index}
                    style={styles.recentChip}
                    onPress={() => handleSearch(search)}
                    icon={() => <Ionicons name=\"time-outline\" size={16} />}
                  >
                    {search}
                  </Chip>
                ))}
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Search Tips */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Search Tips</Title>
            <List.Item
              title=\"Quotes for exact phrases\"
              description='Use \"machine learning\" for exact matches'
              left={() => <List.Icon icon=\"format-quote-close\" />}
            />
            <Divider />
            <List.Item
              title=\"Use operators\"
              description=\"AND, OR, NOT for complex queries\"
              left={() => <List.Icon icon=\"code-braces\" />}
            />
            <Divider />
            <List.Item
              title=\"Semantic search\"
              description=\"Find related concepts and meanings\"
              left={() => <List.Icon icon=\"brain\" />}
            />
          </Card.Content>
        </Card>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchHeader}>
        <Searchbar
          placeholder=\"Search documents, entities, notes...\"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          loading={isSearching}
          icon={() => <Ionicons name=\"search\" size={20} />}
        />
        
        {/* Quick Search Type Toggle */}
        <View style={styles.quickToggle}>
          <IconButton
            icon={() => <Ionicons name=\"options-outline\" size={20} />}
            selected={searchType === 'fulltext'}
            onPress={() => setSearchType(searchType === 'fulltext' ? 'hybrid' : 'fulltext')}
            tooltip=\"Toggle search mode\"
          />
        </View>
      </View>

      {/* Auto-complete Suggestions */}
      {autoCompleteQuery.data?.data && searchQuery.length > 2 && results.length === 0 && (
        <View style={styles.suggestions}>
          {autoCompleteQuery.data.data.map((suggestion, index) => (
            <Button
              key={index}
              mode=\"text\"
              onPress={() => handleSuggestionPress(suggestion.text)}
              style={styles.suggestionButton}
              contentStyle={styles.suggestionContent}
            >
              <View style={styles.suggestionRow}>
                <Ionicons name=\"search\" size={16} color=\"#64748B\" />
                <Paragraph style={styles.suggestionText}>{suggestion.text}</Paragraph>
                <Chip style={styles.suggestionType} textStyle={styles.suggestionTypeText}>
                  {suggestion.type}
                </Chip>
              </View>
            </Button>
          ))}
        </View>
      )}

      {/* Search Results or Default Content */}
      {searchQuery.trim() && results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderSearchResult}
          keyExtractor={(item) => item.id}
          style={styles.resultsList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.resultsHeader}>
              <Paragraph style={styles.resultsCount}>
                {results.length} results for \"{searchQuery}\"
              </Paragraph>
            </View>
          }
        />
      ) : (
        renderEmptyState()
      )}

      {/* Loading Indicator */}
      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size=\"large\" />
          <Paragraph style={styles.loadingText}>Searching...</Paragraph>
        </View>
      )}
    </View>
  );
}

function getResultIcon(type: string, fileType?: string): string {
  if (type === 'document') {
    switch (fileType?.toLowerCase()) {
      case 'pdf': return 'document-text-outline';
      case 'doc':
      case 'docx': return 'document-outline';
      case 'txt': return 'document-text-outline';
      case 'jpg':
      case 'jpeg':
      case 'png': return 'image-outline';
      default: return 'document-outline';
    }
  }
  
  switch (type) {
    case 'entity': return 'shapes-outline';
    case 'note': return 'create-outline';
    default: return 'document-outline';
  }
}

function highlightText(text: string, query: string): string {
  if (!query.trim()) return text;
  
  // Simple highlighting - in a real app, you'd want more sophisticated highlighting
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'gi');
  return text.replace(regex, '**$1**');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    elevation: 2,
  },
  searchBar: {
    flex: 1,
    marginRight: 8,
  },
  quickToggle: {
    marginLeft: 8,
  },
  suggestions: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    maxHeight: 200,
  },
  suggestionButton: {
    justifyContent: 'flex-start',
    borderRadius: 0,
  },
  suggestionContent: {
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  suggestionText: {
    marginLeft: 12,
    flex: 1,
  },
  suggestionType: {
    height: 24,
  },
  suggestionTypeText: {
    fontSize: 10,
  },
  resultsHeader: {
    padding: 16,
    backgroundColor: 'white',
  },
  resultsCount: {
    fontSize: 14,
    color: '#64748B',
  },
  resultsList: {
    flex: 1,
  },
  resultCard: {
    marginHorizontal: 16,
    marginVertical: 4,
    elevation: 1,
  },
  resultHeader: {
    flexDirection: 'row',
  },
  resultInfo: {
    flex: 1,
    flexDirection: 'row',
  },
  resultIcon: {
    marginRight: 12,
    marginTop: 4,
  },
  resultText: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  resultContent: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  resultMeta: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  typeChip: {
    height: 24,
    marginBottom: 4,
  },
  chipText: {
    fontSize: 10,
  },
  scoreText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  highlightsContainer: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  highlightsTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  highlight: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    marginBottom: 24,
  },
  defaultContent: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  searchTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  searchTypeChip: {
    marginRight: 0,
  },
  recentSearches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    marginRight: 0,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
  },
});