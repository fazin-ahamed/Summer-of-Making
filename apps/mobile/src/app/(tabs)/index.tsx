import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { 
  Card, 
  Title, 
  Paragraph, 
  Button, 
  Searchbar,
  Chip,
  Avatar,
  List,
  Divider
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/app';
import { trpc } from '../services/trpc';

export default function HomeScreen() {
  const router = useRouter();
  const { recentDocuments, recentSearches, addRecentSearch } = useAppStore();
  const [searchQuery, setSearchQuery] = React.useState('');

  // Get dashboard stats
  const statsQuery = trpc.dashboard.getStats.useQuery();
  const recentDocsQuery = trpc.documents.getRecent.useQuery({ limit: 5 });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      addRecentSearch(searchQuery.trim());
      router.push(`/search/${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const quickActions = [
    {
      title: 'Scan Document',
      subtitle: 'Camera or Gallery',
      icon: 'camera-outline',
      color: '#6366F1',
      onPress: () => router.push('/scanner'),
    },
    {
      title: 'Voice Note',
      subtitle: 'Record audio',
      icon: 'mic-outline',
      color: '#8B5CF6',
      onPress: () => {},
    },
    {
      title: 'Quick Search',
      subtitle: 'Find anything',
      icon: 'search-outline',
      color: '#10B981',
      onPress: () => router.push('/search'),
    },
    {
      title: 'Upload Files',
      subtitle: 'From device',
      icon: 'cloud-upload-outline',
      color: '#F59E0B',
      onPress: () => {},
    },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Title style={styles.greeting}>Good {getTimeOfDay()}</Title>
          <Paragraph style={styles.subtitle}>Ready to organize your knowledge?</Paragraph>
        </View>
        <Avatar.Icon size={40} icon=\"account\" style={styles.avatar} />
      </View>

      {/* Search Bar */}
      <Searchbar
        placeholder=\"Search documents, notes, entities...\"
        onChangeText={setSearchQuery}
        value={searchQuery}
        onSubmitEditing={handleSearch}
        style={styles.searchBar}
        icon={() => <Ionicons name=\"search\" size={20} />}
      />

      {/* Quick Actions */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Quick Actions</Title>
          <View style={styles.quickActions}>
            {quickActions.map((action, index) => (
              <Button
                key={index}
                mode=\"contained-tonal\"
                onPress={action.onPress}
                style={[styles.quickActionButton, { backgroundColor: `${action.color}20` }]}
                contentStyle={styles.quickActionContent}
                labelStyle={[styles.quickActionLabel, { color: action.color }]}
                icon={() => <Ionicons name={action.icon as any} size={24} color={action.color} />}
              >
                {action.title}
              </Button>
            ))}
          </View>
        </Card.Content>
      </Card>

      {/* Statistics */}
      {statsQuery.data && (
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Your Knowledge Base</Title>
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Title style={styles.statNumber}>{statsQuery.data.data.totalDocuments}</Title>
                <Paragraph style={styles.statLabel}>Documents</Paragraph>
              </View>
              <View style={styles.statItem}>
                <Title style={styles.statNumber}>{statsQuery.data.data.totalEntities}</Title>
                <Paragraph style={styles.statLabel}>Entities</Paragraph>
              </View>
              <View style={styles.statItem}>
                <Title style={styles.statNumber}>{statsQuery.data.data.totalConnections}</Title>
                <Paragraph style={styles.statLabel}>Connections</Paragraph>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Recent Searches</Title>
            <View style={styles.chipsContainer}>
              {recentSearches.slice(0, 6).map((search, index) => (
                <Chip
                  key={index}
                  style={styles.chip}
                  onPress={() => router.push(`/search/${encodeURIComponent(search)}`)}
                >
                  {search}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Recent Documents */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Recent Documents</Title>
          {recentDocsQuery.isLoading ? (
            <Paragraph>Loading...</Paragraph>
          ) : recentDocsQuery.data?.data.length === 0 ? (
            <Paragraph style={styles.emptyText}>No recent documents yet</Paragraph>
          ) : (
            recentDocsQuery.data?.data.map((doc, index) => (
              <React.Fragment key={doc.id}>
                <List.Item
                  title={doc.title}
                  description={doc.summary}
                  left={(props) => (
                    <List.Icon 
                      {...props} 
                      icon={() => (
                        <Ionicons 
                          name={getDocumentIcon(doc.fileType)} 
                          size={24} 
                          color={props.color} 
                        />
                      )} 
                    />
                  )}
                  right={(props) => (
                    <List.Icon 
                      {...props} 
                      icon=\"chevron-right\" 
                    />
                  )}
                  onPress={() => router.push(`/document/${doc.id}`)}
                />
                {index < (recentDocsQuery.data?.data.length || 0) - 1 && <Divider />}
              </React.Fragment>
            ))
          )}
          
          {recentDocsQuery.data?.data && recentDocsQuery.data.data.length > 0 && (
            <Button
              mode=\"text\"
              onPress={() => router.push('/documents')}
              style={styles.viewAllButton}
            >
              View All Documents
            </Button>
          )}
        </Card.Content>
      </Card>

      {/* Today's AI Insights */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>AI Insights</Title>
          <View style={styles.insightContainer}>
            <Ionicons name=\"bulb-outline\" size={24} color=\"#F59E0B\" />
            <View style={styles.insightContent}>
              <Paragraph style={styles.insightTitle}>Pattern Detected</Paragraph>
              <Paragraph style={styles.insightDescription}>
                You've been researching machine learning frequently. Consider creating a dedicated collection.
              </Paragraph>
            </View>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function getDocumentIcon(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'document-text-outline';
    case 'doc':
    case 'docx':
      return 'document-outline';
    case 'txt':
      return 'document-text-outline';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return 'image-outline';
    case 'mp3':
    case 'wav':
      return 'musical-notes-outline';
    case 'mp4':
    case 'avi':
      return 'videocam-outline';
    default:
      return 'document-outline';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
  },
  avatar: {
    backgroundColor: '#6366F1',
  },
  searchBar: {
    marginBottom: 20,
    elevation: 2,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    minWidth: '47%',
    marginBottom: 8,
  },
  quickActionContent: {
    flexDirection: 'column',
    paddingVertical: 12,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    marginRight: 0,
    marginBottom: 4,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.7,
    fontStyle: 'italic',
  },
  viewAllButton: {
    marginTop: 8,
  },
  insightContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
  },
  insightContent: {
    flex: 1,
    marginLeft: 12,
  },
  insightTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  insightDescription: {
    fontSize: 14,
    opacity: 0.8,
  },
});