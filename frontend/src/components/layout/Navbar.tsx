'use client';

import { Bell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const UNREAD_NOTIF_COUNT = 2;

export default function Navbar({ onMobileMenuClick }: { onMobileMenuClick: () => void }) {
  const { user, logout } = useAuthStore();
  const { canAccessParametres } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center border-b bg-white/90 backdrop-blur-md px-4 sm:px-6 gap-3">
      <button
        type="button"
        onClick={onMobileMenuClick}
        className="inline-flex items-center justify-center rounded-lg border border-stone-200 bg-white p-2 text-stone-600 transition-colors hover:bg-muted/80 lg:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      {/* Right section: Notifications + User menu */}
      <div className="flex items-center gap-2">
        <Link href="/dashboard/logs" className="relative">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Bell className="h-4 w-4" />
            {UNREAD_NOTIF_COUNT > 0 && (
              <span className={cn(
                'absolute right-1 top-1 flex items-center justify-center rounded-full bg-red-500 text-white font-bold ring-2 ring-white',
                'h-3.5 w-3.5 text-[8px]'
              )}>
                {UNREAD_NOTIF_COUNT}
              </span>
            )}
          </Button>
        </Link>

        {/* User menu */}
        <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2.5 px-2 h-9 hover:bg-muted/60">
            <div className="hidden sm:flex flex-col items-end leading-none">
              <span className="text-[13px] font-semibold text-foreground">{user?.prenom} {user?.nom}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{user?.role?.name}</span>
            </div>
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #c47d0e, #b8860b)' }}
            >
              {user?.prenom?.[0]}{user?.nom?.[0]}
            </div>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            <Link href="/dashboard/profil" className="text-sm cursor-pointer">
              Mon compte
            </Link>
          </DropdownMenuLabel>
          {canAccessParametres && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/parametres" className="text-sm cursor-pointer">
                  Paramètres
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-sm text-red-500 focus:text-red-600 focus:bg-red-50 cursor-pointer"
            onClick={handleLogout}
          >
            Déconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
