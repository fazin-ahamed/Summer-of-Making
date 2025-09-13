import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import { QueryClient } from '@tanstack/react-query';
import type { AppRouter } from '../../../backend/api/src/trpc';

// Create the tRPC client
export const trpc = createTRPCReact<AppRouter>();

// Get API endpoint from electron store or default
const getApiEndpoint = async (): Promise<string> => {
  if (window.electronAPI) {
    try {
      const endpoint = await window.electronAPI.store.get('apiEndpoint');
      return endpoint || 'http://localhost:3001';
    } catch (error) {
      console.warn('Failed to get API endpoint from store:', error);
      return 'http://localhost:3001';
    }
  }
  return 'http://localhost:3001';
};

let apiEndpoint = 'http://localhost:3001';

// Initialize endpoint
if (window.electronAPI) {
  getApiEndpoint().then(endpoint => {
    apiEndpoint = endpoint;
  });
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: () => `${apiEndpoint}/trpc`,
      fetch: async (url, options) => {
        // Add authentication headers if available
        const headers = new Headers(options?.headers);
        
        // Add request ID for tracing
        headers.set('x-request-id', crypto.randomUUID());
        
        // Add user agent
        headers.set('user-agent', 'AutoOrganize Desktop');
        
        return fetch(url, {
          ...options,
          headers,
        });
      },
    }),
  ],
});

// Utility function to update API endpoint
export const updateApiEndpoint = async (endpoint: string) => {
  apiEndpoint = endpoint;
  if (window.electronAPI) {
    await window.electronAPI.store.set('apiEndpoint', endpoint);
  }
  // Note: In a real app, you'd need to recreate the tRPC client
  // or implement dynamic endpoint switching
};

// Error handling utilities
export const handleTRPCError = (error: any) => {
  console.error('tRPC Error:', error);
  
  if (error.data?.code === 'UNAUTHORIZED') {
    // Handle authentication errors
    console.warn('Unauthorized access');
  } else if (error.data?.code === 'INTERNAL_SERVER_ERROR') {
    // Handle server errors
    console.error('Server error:', error.message);
  }
  
  return {
    title: 'Error',
    message: error.message || 'An unexpected error occurred',
    type: 'error' as const,
  };
};

// React Query error handler
export const queryErrorHandler = (error: unknown) => {
  console.error('Query error:', error);
  
  if (window.electronAPI) {
    window.electronAPI.showMessage({
      type: 'error',
      title: 'Connection Error',
      message: 'Failed to connect to the backend service. Please ensure the API server is running.',
      buttons: ['OK'],
    });
  }
};