import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { trpc, trpcClient } from '../services/trpc';
import { useAppStore } from '../store/app';
import { theme } from '../utils/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export default function RootLayout() {
  const { colorScheme } = useAppStore();

  return (
    <SafeAreaProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme[colorScheme]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen 
                name="search/[query]" 
                options={{ 
                  presentation: 'modal',
                  headerShown: true,
                  title: 'Search Results'
                }} 
              />
              <Stack.Screen 
                name="document/[id]" 
                options={{ 
                  headerShown: true,
                  title: 'Document'
                }} 
              />
              <Stack.Screen 
                name="camera" 
                options={{ 
                  presentation: 'fullScreenModal',
                  headerShown: false
                }} 
              />
              <Stack.Screen 
                name="settings" 
                options={{ 
                  presentation: 'modal',
                  headerShown: true,
                  title: 'Settings'
                }} 
              />
            </Stack>
            <Toast />
          </PaperProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </SafeAreaProvider>
  );
}