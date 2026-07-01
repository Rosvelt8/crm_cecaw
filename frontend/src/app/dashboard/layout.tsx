 'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import AuthGuard from '@/components/auth/AuthGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <AuthGuard requireAuth={true}>
      <div className="flex min-h-screen bg-background">
        <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <main
          className={cn(
            'flex-1 transition-all duration-300',
            sidebarOpen ? 'lg:pl-64 pl-0' : 'lg:pl-14 pl-0'
          )}
        >
          <Navbar onMobileMenuClick={() => setMobileSidebarOpen(true)} />
          <div className="p-4 lg:p-6 animate-slide-up">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
