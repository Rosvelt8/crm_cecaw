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
      <div className="flex flex-col min-h-screen bg-background">
        <Navbar onMobileMenuClick={() => setMobileSidebarOpen(true)} />
        <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <main className="flex-1 w-full">
          <div className={cn(
            'p-4 lg:p-6 animate-slide-up transition-all duration-300',
            sidebarOpen ? 'lg:ml-64' : 'lg:ml-14'
          )}>
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
