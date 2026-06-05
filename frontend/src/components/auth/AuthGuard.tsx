'use client';

import { useAuthStore } from '@/stores/useAuthStore';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: ReactNode;
  requireAuth?: boolean;
}

export default function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const { is_authenticated, is_loading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!is_loading) {
      if (requireAuth && !is_authenticated) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      } else if (!requireAuth && is_authenticated && pathname.startsWith('/login')) {
        router.replace('/dashboard');
      }
    }
  }, [is_authenticated, is_loading, requireAuth, router, pathname]);

  if (is_loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Chargement de votre session...</p>
        </div>
      </div>
    );
  }

  // Prevent flicker before redirect
  if (requireAuth && !is_authenticated) return null;
  if (!requireAuth && is_authenticated && pathname.startsWith('/login')) return null;

  return <>{children}</>;
}
