import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SearchHistory {
  id: string;
  query: string;
  timestamp: Date;
  resultCount: number;
}

export interface AppState {
  // Theme and UI
  colorScheme: 'light' | 'dark' | 'system';
  isFirstLaunch: boolean;
  
  // Search
  searchHistory: SearchHistory[];
  recentSearches: string[];
  
  // Documents
  recentDocuments: string[];
  favoriteDocuments: string[];
  
  // Settings
  settings: {
    autoSync: boolean;
    cameraQuality: 'low' | 'medium' | 'high';
    storageLocation: 'local' | 'cloud';
    notifications: boolean;
    biometricAuth: boolean;
  };
  
  // Actions
  setColorScheme: (scheme: 'light' | 'dark' | 'system') => void;
  setFirstLaunch: (isFirst: boolean) => void;
  addSearchHistory: (search: Omit<SearchHistory, 'id' | 'timestamp'>) => void;
  clearSearchHistory: () => void;
  addRecentSearch: (query: string) => void;
  addRecentDocument: (documentId: string) => void;
  toggleFavoriteDocument: (documentId: string) => void;
  updateSettings: (settings: Partial<AppState['settings']>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      colorScheme: 'system',
      isFirstLaunch: true,
      searchHistory: [],
      recentSearches: [],
      recentDocuments: [],
      favoriteDocuments: [],
      settings: {
        autoSync: true,
        cameraQuality: 'high',
        storageLocation: 'local',
        notifications: true,
        biometricAuth: false,
      },

      // Actions
      setColorScheme: (scheme) => set({ colorScheme: scheme }),
      
      setFirstLaunch: (isFirst) => set({ isFirstLaunch: isFirst }),
      
      addSearchHistory: (search) => {
        const history = get().searchHistory;
        const newEntry: SearchHistory = {
          ...search,
          id: Date.now().toString(),
          timestamp: new Date(),
        };
        set({
          searchHistory: [newEntry, ...history.slice(0, 49)], // Keep last 50
        });
      },
      
      clearSearchHistory: () => set({ searchHistory: [] }),
      
      addRecentSearch: (query) => {
        const recent = get().recentSearches;
        const filtered = recent.filter(q => q !== query);
        set({
          recentSearches: [query, ...filtered.slice(0, 9)], // Keep last 10
        });
      },
      
      addRecentDocument: (documentId) => {
        const recent = get().recentDocuments;
        const filtered = recent.filter(id => id !== documentId);
        set({
          recentDocuments: [documentId, ...filtered.slice(0, 19)], // Keep last 20
        });
      },
      
      toggleFavoriteDocument: (documentId) => {
        const favorites = get().favoriteDocuments;
        const isFavorite = favorites.includes(documentId);
        set({
          favoriteDocuments: isFavorite
            ? favorites.filter(id => id !== documentId)
            : [...favorites, documentId],
        });
      },
      
      updateSettings: (newSettings) => {
        const currentSettings = get().settings;
        set({
          settings: { ...currentSettings, ...newSettings },
        });
      },
    }),
    {
      name: 'autoorganize-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        colorScheme: state.colorScheme,
        isFirstLaunch: state.isFirstLaunch,
        searchHistory: state.searchHistory,
        recentSearches: state.recentSearches,
        recentDocuments: state.recentDocuments,
        favoriteDocuments: state.favoriteDocuments,
        settings: state.settings,
      }),
    }
  )
);