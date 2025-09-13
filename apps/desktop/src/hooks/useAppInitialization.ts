import { useEffect, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import { appLoadingState, userPreferencesState } from '../store/ui';
import { trpc } from '../utils/trpc';

export const useAppInitialization = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAppLoading = useSetRecoilState(appLoadingState);
  const setUserPreferences = useSetRecoilState(userPreferencesState);

  // Test API connection
  const healthCheck = trpc.system.health.useQuery(undefined, {
    enabled: false,
    retry: 3,
    retryDelay: 1000,
  });

  useEffect(() => {
    const initialize = async () => {
      try {
        setAppLoading(prev => ({ ...prev, isInitializing: true }));

        // Load user preferences from electron store
        if (window.electronAPI) {
          try {
            const preferences = await window.electronAPI.store.get('userPreferences');
            if (preferences) {
              setUserPreferences(preferences);
            }
          } catch (err) {
            console.warn('Failed to load user preferences:', err);
          }
        }

        // Test API connection
        try {
          await healthCheck.refetch();
          setAppLoading(prev => ({ 
            ...prev, 
            isConnectedToAPI: true,
            lastConnectionCheck: new Date(),
          }));
        } catch (err) {
          console.warn('API connection failed:', err);
          setAppLoading(prev => ({ 
            ...prev, 
            isConnectedToAPI: false,
            lastConnectionCheck: new Date(),
          }));
          // Don't fail initialization if API is not available
        }

        // Setup periodic health checks
        const healthCheckInterval = setInterval(async () => {
          try {
            await healthCheck.refetch();
            setAppLoading(prev => ({ 
              ...prev, 
              isConnectedToAPI: true,
              lastConnectionCheck: new Date(),
            }));
          } catch (err) {
            setAppLoading(prev => ({ 
              ...prev, 
              isConnectedToAPI: false,
              lastConnectionCheck: new Date(),
            }));
          }
        }, 30000); // Check every 30 seconds

        setAppLoading(prev => ({ ...prev, isInitializing: false }));
        setIsInitialized(true);

        // Cleanup interval on unmount
        return () => {
          clearInterval(healthCheckInterval);
        };
      } catch (err) {
        console.error('App initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize application');
        setAppLoading(prev => ({ ...prev, isInitializing: false }));
      }
    };

    initialize();
  }, [healthCheck, setAppLoading, setUserPreferences]);

  return {
    isInitialized,
    error,
    isLoading: !isInitialized && !error,
  };
};