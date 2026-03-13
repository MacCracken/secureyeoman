import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { LicenseProvider } from './hooks/useLicense';
import { applyTheme, type ThemeId } from './hooks/useTheme';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// Apply saved theme on load (before render to avoid flash)
const savedTheme = (localStorage.getItem('theme') || 'dark') as ThemeId;
applyTheme(savedTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <LicenseProvider>
            <App />
          </LicenseProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Register service worker for offline-first PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[SW] Registration failed:', err);
    });
  });
}
