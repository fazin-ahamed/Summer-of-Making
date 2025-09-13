import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  List,
  Switch,
  Button,
  Divider,
  Avatar,
  Chip,
  ProgressBar,
  RadioButton,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/app';
import { RustBridge } from '../services/rustBridge';
import { trpc } from '../services/trpc';

export default function ProfileScreen() {
  const router = useRouter();
  const { 
    settings, 
    updateSettings, 
    colorScheme, 
    setColorScheme,
    searchHistory,
    clearSearchHistory,
    favoriteDocuments,
    recentDocuments
  } = useAppStore();

  const [isExporting, setIsExporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const statsQuery = trpc.dashboard.getStats.useQuery();
  const rustBridge = RustBridge.getInstance();

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      // TODO: Implement actual data export
      await new Promise(resolve => setTimeout(resolve, 2000));
      Alert.alert('Export Complete', 'Your data has been exported successfully.');
    } catch (error) {
      Alert.alert('Export Error', 'Failed to export data.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your local data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: () => {
            clearSearchHistory();
            Alert.alert('Data Cleared', 'All local data has been cleared.');
          }
        },
      ]
    );
  };

  const platformInfo = rustBridge.getPlatformInfo();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Header */}
      <Card style={styles.profileCard}>
        <Card.Content style={styles.profileContent}>
          <Avatar.Icon size={80} icon="account" style={styles.avatar} />
          <View style={styles.profileInfo}>
            <Title style={styles.profileName}>AutoOrganize User</Title>
            <Paragraph style={styles.profileSubtitle}>Knowledge Organizer</Paragraph>
            
            {statsQuery.data && (
              <View style={styles.statsRow}>
                <Chip style={styles.statChip} textStyle={styles.statText}>
                  {statsQuery.data.data.totalDocuments} docs
                </Chip>
                <Chip style={styles.statChip} textStyle={styles.statText}>
                  {statsQuery.data.data.totalEntities} entities
                </Chip>
                <Chip style={styles.statChip} textStyle={styles.statText}>
                  {favoriteDocuments.length} favorites
                </Chip>
              </View>
            )}
          </View>
        </Card.Content>
      </Card>

      {/* Storage & Sync */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Storage & Sync</Title>
          
          <List.Item
            title="Auto Sync"
            description="Automatically sync with cloud storage"
            left={() => <List.Icon icon="cloud-sync" />}
            right={() => (
              <Switch
                value={settings.autoSync}
                onValueChange={(value) => updateSettings({ autoSync: value })}
              />
            )}
          />
          
          <List.Item
            title="Storage Location"
            description={settings.storageLocation === 'local' ? 'Local Device' : 'Cloud Storage'}
            left={() => <List.Icon icon="folder" />}
            onPress={() => {
              const newLocation = settings.storageLocation === 'local' ? 'cloud' : 'local';
              updateSettings({ storageLocation: newLocation });
            }}
          />

          {syncProgress > 0 && (
            <View style={styles.progressContainer}>
              <Paragraph style={styles.progressText}>Syncing...</Paragraph>
              <ProgressBar progress={syncProgress} color="#6366F1" style={styles.progressBar} />
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Camera & Scanning */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Camera & Scanning</Title>
          
          <List.Item
            title="Camera Quality"
            description={`Current: ${settings.cameraQuality.charAt(0).toUpperCase() + settings.cameraQuality.slice(1)}`}
            left={() => <List.Icon icon="camera" />}
          />

          <View style={styles.radioGroup}>
            {(['low', 'medium', 'high'] as const).map((quality) => (
              <View key={quality} style={styles.radioItem}>
                <RadioButton
                  value={quality}
                  status={settings.cameraQuality === quality ? 'checked' : 'unchecked'}
                  onPress={() => updateSettings({ cameraQuality: quality })}
                />
                <Paragraph style={styles.radioLabel}>
                  {quality.charAt(0).toUpperCase() + quality.slice(1)}
                  {quality === 'high' && ' (Recommended)'}
                </Paragraph>
              </View>
            ))}
          </View>
        </Card.Content>
      </Card>

      {/* Appearance */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Appearance</Title>
          
          <List.Item
            title="Theme"
            description={`Current: ${colorScheme.charAt(0).toUpperCase() + colorScheme.slice(1)}`}
            left={() => <List.Icon icon="palette" />}
          />

          <View style={styles.radioGroup}>
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <View key={theme} style={styles.radioItem}>
                <RadioButton
                  value={theme}
                  status={colorScheme === theme ? 'checked' : 'unchecked'}
                  onPress={() => setColorScheme(theme)}
                />
                <Paragraph style={styles.radioLabel}>
                  {theme === 'system' ? 'System Default' : theme.charAt(0).toUpperCase() + theme.slice(1)}
                </Paragraph>
              </View>
            ))}
          </View>
        </Card.Content>
      </Card>

      {/* Privacy & Security */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Privacy & Security</Title>
          
          <List.Item
            title="Biometric Authentication"
            description="Use fingerprint or face ID"
            left={() => <List.Icon icon="fingerprint" />}
            right={() => (
              <Switch
                value={settings.biometricAuth}
                onValueChange={(value) => updateSettings({ biometricAuth: value })}
              />
            )}
          />
          
          <List.Item
            title="Notifications"
            description="App notifications and updates"
            left={() => <List.Icon icon="bell" />}
            right={() => (
              <Switch
                value={settings.notifications}
                onValueChange={(value) => updateSettings({ notifications: value })}
              />
            )}
          />
        </Card.Content>
      </Card>

      {/* Data Management */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Data Management</Title>
          
          <List.Item
            title="Search History"
            description={`${searchHistory.length} searches stored`}
            left={() => <List.Icon icon="history" />}
            right={() => (
              <Button
                mode="text"
                onPress={clearSearchHistory}
                disabled={searchHistory.length === 0}
              >
                Clear
              </Button>
            )}
          />
          
          <List.Item
            title="Export Data"
            description="Download all your data"
            left={() => <List.Icon icon="download" />}
            right={() => (
              <Button
                mode="text"
                onPress={handleExportData}
                loading={isExporting}
                disabled={isExporting}
              >
                Export
              </Button>
            )}
          />
          
          <Divider style={styles.divider} />
          
          <List.Item
            title="Clear All Data"
            description="Permanently delete all local data"
            left={() => <List.Icon icon="delete" color="#EF4444" />}
            titleStyle={styles.dangerText}
            onPress={handleClearData}
          />
        </Card.Content>
      </Card>

      {/* System Information */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>System Information</Title>
          
          <List.Item
            title="Platform"
            description={platformInfo.platform}
            left={() => <List.Icon icon="cellphone" />}
          />
          
          <List.Item
            title="Native Module"
            description={platformInfo.hasNativeModule ? 'Available' : 'Mock Mode'}
            left={() => <List.Icon icon="code-braces" />}
            right={() => (
              <Chip 
                style={[
                  styles.statusChip,
                  { backgroundColor: platformInfo.hasNativeModule ? '#10B98120' : '#F59E0B20' }
                ]}
                textStyle={[
                  styles.statusText,
                  { color: platformInfo.hasNativeModule ? '#059669' : '#D97706' }
                ]}
              >
                {platformInfo.hasNativeModule ? 'Ready' : 'Development'}
              </Chip>
            )}
          />
          
          <List.Item
            title="Version"
            description={platformInfo.version}
            left={() => <List.Icon icon="information" />}
          />
        </Card.Content>
      </Card>

      {/* App Actions */}
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>App</Title>
          
          <List.Item
            title="Help & Support"
            description="Get help and contact support"
            left={() => <List.Icon icon="help-circle" />}
            onPress={() => {
              // TODO: Open help screen
            }}
          />
          
          <List.Item
            title="About"
            description="App information and licenses"
            left={() => <List.Icon icon="information-outline" />}
            onPress={() => {
              Alert.alert(
                'AutoOrganize Mobile',
                `Version: ${platformInfo.version}

A personal knowledge management system that helps you organize, search, and connect your information.

© 2023 AutoOrganize`
              );
            }}
          />
          
          <List.Item
            title="Settings"
            description="Advanced app settings"
            left={() => <List.Icon icon="cog" />}
            onPress={() => router.push('/settings')}
          />
        </Card.Content>
      </Card>

      {/* Bottom spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  profileCard: {
    margin: 16,
    elevation: 2,
  },
  profileContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatar: {
    backgroundColor: '#6366F1',
    marginBottom: 16,
  },
  profileInfo: {
    alignItems: 'center',
  },
  profileName: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileSubtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    height: 28,
  },
  statText: {
    fontSize: 12,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  radioGroup: {
    marginLeft: 16,
    marginTop: 8,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  radioLabel: {
    marginLeft: 8,
    fontSize: 14,
  },
  progressContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  progressText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  statusChip: {
    height: 24,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  divider: {
    marginVertical: 8,
  },
  dangerText: {
    color: '#EF4444',
  },
  bottomSpacing: {
    height: 32,
  },
});