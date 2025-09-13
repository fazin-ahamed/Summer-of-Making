import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { trpc, trpcClient } from './utils/trpc';
import './styles/globals.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Remove loading screen when React is ready
const removeLoadingScreen = () => {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 0.3s ease-out';
    setTimeout(() => {
      loadingScreen.remove();
    }, 300);
  }
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <BrowserRouter>
            <App onReady={removeLoadingScreen} />
          </BrowserRouter>
        </RecoilRoot>
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>
);

// Handle menu actions from Electron
if (window.electronAPI) {
  window.electronAPI.onMenuAction((action: string) => {
    // Dispatch custom events that components can listen to
    window.dispatchEvent(new CustomEvent('menu-action', { detail: action }));
  });
}