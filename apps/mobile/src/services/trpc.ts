import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import type { AppRouter } from '@autoorganize/backend/api';
import Constants from 'expo-constants';

// Create tRPC client
export const trpc = createTRPCReact<AppRouter>();

// Get API URL based on environment
const getApiUrl = () => {
  // In development, use localhost
  if (__DEV__) {
    // For iOS simulator use localhost
    // For Android emulator use 10.0.2.2
    // For physical device, use your computer's IP address
    const baseUrl = Platform.OS === 'android' 
      ? 'http://10.0.2.2:3001' 
      : 'http://localhost:3001';
    return `${baseUrl}/api/trpc`;
  }
  
  // In production, use your deployed API URL
  return Constants.expoConfig?.extra?.apiUrl || 'https://api.autoorganize.com/trpc';
};

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: getApiUrl(),
      headers: async () => {
        // Add authentication headers if needed
        return {
          'Content-Type': 'application/json',
          // Add auth token when implemented
          // 'Authorization': `Bearer ${await getAuthToken()}`,
        };
      },
    }),
  ],
});