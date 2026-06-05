'use client';

import type { ReactNode } from 'react';
import QueryProvider from './QueryProvider';
import AuthProvider from './AuthProvider';
import { Toaster } from 'sonner';

export default function AppProvider({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </QueryProvider>
  );
}
