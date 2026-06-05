'use client';

import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import AuthGuard from '@/components/auth/AuthGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();

  return (
    <AuthGuard requireAuth={true}>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main
          className={cn(
            'flex-1 transition-all duration-300',
            sidebarOpen ? 'pl-72' : 'pl-20'
          )}
        >
          <Navbar />
          <div className="p-6 lg:p-8 animate-slide-up">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
