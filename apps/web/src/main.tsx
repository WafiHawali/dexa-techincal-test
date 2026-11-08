import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { BrowserRouter } from 'react-router';
import { App, AppErrorBoundary } from './App';
import { AuthProvider } from './lib/auth';
import './styles.css';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => {
        if (axios.isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500) return false;
        return count < 1;
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><QueryClientProvider client={client}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider></AppErrorBoundary></StrictMode>,
);
