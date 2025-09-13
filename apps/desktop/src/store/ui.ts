import { atom, selector } from 'recoil';

// Theme state
export const themeState = atom<'light' | 'dark' | 'system'>({
  key: 'themeState',
  default: 'system',
  effects: [
    ({ setSelf, onSet }) => {
      // Load from electron store on initialization
      if (window.electronAPI) {
        window.electronAPI.store.get('theme').then((savedTheme) => {
          if (savedTheme) {
            setSelf(savedTheme);
          }
        });
      }

      // Save to electron store on change
      onSet((newValue) => {
        if (window.electronAPI) {
          window.electronAPI.store.set('theme', newValue);
        }
      });
    },
  ],
});

// Computed theme (resolves 'system' to actual theme)
export const computedThemeState = selector({
  key: 'computedThemeState',
  get: ({ get }) => {
    const theme = get(themeState);
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  },
});

// Sidebar state
export const sidebarState = atom({
  key: 'sidebarState',
  default: {
    isCollapsed: false,
    activeItem: 'dashboard',
  },
});

// Search state
export const searchState = atom({
  key: 'searchState',
  default: {
    query: '',
    filters: {
      fileTypes: [] as string[],
      dateRange: {
        start: null as string | null,
        end: null as string | null,
      },
      tags: [] as string[],
    },
    results: [],
    isLoading: false,
    totalResults: 0,
  },
});

// Modal state
export const modalState = atom({
  key: 'modalState',
  default: {
    isOpen: false,
    type: null as string | null,
    data: null as any,
  },
});

// Notification state
export const notificationState = atom({
  key: 'notificationState',
  default: {
    notifications: [] as Array<{
      id: string;
      title: string;
      message: string;
      type: 'info' | 'success' | 'warning' | 'error';
      timestamp: Date;
      read: boolean;
    }>,
    unreadCount: 0,
  },
});

// App loading state
export const appLoadingState = atom({
  key: 'appLoadingState',
  default: {
    isInitializing: true,
    isConnectedToAPI: false,
    lastConnectionCheck: null as Date | null,
  },
});

// Window state
export const windowState = atom({
  key: 'windowState',
  default: {
    isMaximized: false,
    isFullscreen: false,
    bounds: {
      width: 1200,
      height: 800,
    },
  },
});

// Recent files state
export const recentFilesState = atom({
  key: 'recentFilesState',
  default: [] as Array<{
    path: string;
    name: string;
    lastAccessed: Date;
    type: string;
    size: number;
  }>,
  effects: [
    ({ setSelf, onSet }) => {
      // Load from electron store
      if (window.electronAPI) {
        window.electronAPI.store.get('recentFiles').then((files) => {
          if (files) {
            setSelf(files);
          }
        });
      }

      // Save to electron store
      onSet((newValue) => {
        if (window.electronAPI) {
          window.electronAPI.store.set('recentFiles', newValue);
        }
      });
    },
  ],
});

// User preferences state
export const userPreferencesState = atom({
  key: 'userPreferencesState',
  default: {
    apiEndpoint: 'http://localhost:3001',
    autoLaunch: false,
    notifications: true,
    searchResultsPerPage: 20,
    defaultView: 'list' as 'list' | 'grid' | 'graph',
    keyboardShortcuts: true,
    autoSave: true,
    autoBackup: false,
    backupInterval: 24, // hours
  },
  effects: [
    ({ setSelf, onSet }) => {
      // Load from electron store
      if (window.electronAPI) {
        window.electronAPI.store.get('userPreferences').then((prefs) => {
          if (prefs) {
            setSelf(prefs);
          }
        });
      }

      // Save to electron store
      onSet((newValue) => {
        if (window.electronAPI) {
          window.electronAPI.store.set('userPreferences', newValue);
        }
      });
    },
  ],
});