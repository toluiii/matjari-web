'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            retry: false,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </QueryClientProvider>
  );
}
