'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  Users, UserSquare2, BookOpen, ArrowLeftRight,
  UserCog, Target, MapPin,
  BarChart2, ScrollText, Settings,
  Layers, Package, Building2, UsersRound, ShieldCheck,
  LogOut, PanelLeftClose, PanelLeftOpen, ChevronDown, LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

type NavItem  = { label: string; href: string; icon: React.ElementType; exact?: boolean };
type NavGroup = {
  icon?: React.ElementType;
  id: string;
  label: string;
  items: NavItem[];
  accent: string;
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'marketing',
    label: 'Marketing & CRM',
    accent: 'text-amber-600',
    icon: BarChart2,
    items: [
      { label: 'Prospects',    href: '/dashboard/marketing/prospects',    icon: Users },
      { label: 'Clients',      href: '/dashboard/marketing/clients',      icon: UserSquare2 },
    ],
  },
  {
    id: 'collecte',
    label: 'Collecte Terrain',
    accent: 'text-emerald-600',
    icon: Package,
    items: [
      { label: 'Agents',    href: '/dashboard/collecte/agents',    icon: UserCog },
      { label: 'Objectifs', href: '/dashboard/collecte/objectifs', icon: Target },
      { label: 'Terrain',   href: '/dashboard/collecte/terrain',   icon: MapPin },
    ],
  },
  {
    id: 'statistiques',
    icon: BarChart2,
    label: 'Statistiques',
    accent: 'text-violet-600',
    items: [
      { label: 'Performances', href: '/dashboard/statistiques', icon: BarChart2 },
    ],
  },
  {
    id: 'logs',
    label: 'Journal',
    accent: 'text-sky-600',
    icon: ScrollText,
    items: [
      { label: "Activité", href: '/dashboard/logs', icon: ScrollText },
    ],
  },
  {
    id: 'parametres',
    label: 'Paramètres',
    accent: 'text-slate-500',
    icon: UserCog,
    items: [
      { label: 'Général',      href: '/dashboard/parametres',              icon: Settings, exact: true },
      { label: 'Groupes',      href: '/dashboard/parametres/groupes',      icon: Layers },
      { label: 'Produits',     href: '/dashboard/parametres/produits',      icon: Package },
      { label: 'Agences',      href: '/dashboard/parametres/agences',       icon: Building2 },
      { label: 'Équipes',      href: '/dashboard/parametres/equipes',       icon: UsersRound },
      { label: 'Utilisateurs', href: '/dashboard/parametres/utilisateurs',  icon: ShieldCheck },
    ],
  },
];

function getInitials(prenom?: string, nom?: string) {
  return `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase() || '?';
}

// Items accessible to agents (by href prefix)
const AGENT_ALLOWED_HREFS = [
  '/dashboard/marketing/prospects',
  '/dashboard/marketing/clients',
  '/dashboard/collecte/objectifs',
];

export default function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const { user, logout } = useAuthStore();
  const { isAgent } = useAuth();
  const pathname = usePathname();

  // Filter nav for agents
  const visibleGroups = isAgent
    ? NAV_GROUPS
        .map((g) => ({ ...g, items: g.items.filter((i) => AGENT_ALLOWED_HREFS.some((h) => i.href.startsWith(h))) }))
        .filter((g) => g.items.length > 0)
    : NAV_GROUPS;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => NAV_GROUPS.reduce((acc, g) => ({ ...acc, [g.id]: true }), {} as Record<string, boolean>)
  );

  const toggleGroup = (id: string) =>
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

  // The mobile drawer always shows full content (labels, expanded layout) regardless of
  // the persisted desktop collapse state — collapsing to an icon rail only makes sense
  // for the permanently-docked desktop sidebar, not a full-width overlay drawer.
  const showFull = mobileOpen || sidebarOpen;

  const isActive = (href: string, exact?: boolean) =>
    pathname === href || (!exact && pathname.startsWith(href + '/'));

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onMobileClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col transition-all duration-300 border-r border-stone-200/80 bg-white',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0',
          sidebarOpen ? 'lg:w-64 w-72' : 'lg:w-14 w-72'
        )}
        style={{
          background: 'linear-gradient(160deg, #ffffff 0%, #fdf8f0 55%, #faf4e8 100%)',
        }}
    >
      {/* ── Gold accent stripe at very top ── */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ background: 'linear-gradient(90deg, #b8860b 0%, #e5b830 50%, #b8860b 100%)' }}
      />

      {/* ── Logo / Brand ── */}
      <div
        className={cn(
          'flex items-center shrink-0 border-b border-stone-100',
          showFull ? 'gap-3 px-4 py-3' : 'justify-center py-3'
        )}
      >
        {/* Emblem */}
        <div
          className="shrink-0 rounded-xl flex items-center justify-center shadow-md"
          style={{
            width: showFull ? 36 : 34,
            height: showFull ? 36 : 34,
            background: 'linear-gradient(135deg, #ffffff 0%, #ffffff 100%)',
          }}
        >
          <Image
            src="/logo.png"
            alt="Cecaw Finance S.A"
            width={44}
            height={44}
            className="object-contain"
          />
          </div>

          {/* Brand name — only when open */}
          {showFull && (
            <>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[15px] font-black tracking-[0.08em] uppercase leading-none text-stone-800"
                  style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
                >
                  Cecaw Finance S.A
                </p>
                
              </div>
              <button
                onClick={toggleSidebar}
                className="hidden lg:inline-flex rounded-full border border-stone-200 bg-white p-1 text-stone-500 shadow-sm hover:bg-stone-50 transition-colors"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </>
          )}
      </div>

      {/* Toggle button when collapsed */}
      {!showFull && (
        <button
          onClick={toggleSidebar}
          className="mx-auto mt-2 mb-1 h-7 w-7 rounded-md flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors shrink-0"
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-2">
        {/* Dashboard link */}
        <div className={cn('px-2 pb-1', !showFull && 'px-1.5')}>
          {(() => {
            const active = pathname === '/dashboard';
            return (
              <Link
                href="/dashboard"
                title={!showFull ? 'Dashboard' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg text-[13.5px] font-medium transition-all duration-150',
                  showFull ? 'pl-4 pr-3 py-2' : 'py-2.5 justify-end pr-2',
                  active ? 'text-white shadow-sm' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                )}
                style={active ? {
                  background: 'linear-gradient(135deg, #c47d0e 0%, #b8860b 50%, #96670a 100%)',
                  boxShadow: '0 2px 8px rgba(184,134,11,0.30)',
                } : undefined}
              >
                <LayoutDashboard className={cn('h-[15px] w-[15px] shrink-0', active ? 'text-white/90' : 'text-stone-500')} />
                {showFull && <span className="truncate">Dashboard</span>}
              </Link>
            );
          })()}
        </div>
        <div className={cn('mx-3 mb-2 h-px bg-stone-200/70')} />

        {visibleGroups.map((group, i) => {
          const isOpen = openGroups[group.id];
          const hasActive = group.items.some(item => isActive(item.href, item.exact));

          return (
            <div key={group.id} className={cn(i > 0 && showFull && 'mt-5')}>
              {/* Group header */}
              {showFull ? (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    'w-full inline-flex items-center justify-between px-4 py-1.5 rounded-none transition-colors group',
                  )}
                >
                  <span className={cn(
                    'inline-flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] transition-colors',
                    hasActive ? group.accent : 'text-stone-500 group-hover:text-stone-700'
                  )}>
                    {group.icon && <group.icon className="h-4 w-4" />}
                    {group.label}
                  </span>
                  <ChevronDown className={cn(
                    'h-3.5 w-3.5 transition-all duration-200',
                    hasActive ? group.accent : 'text-stone-400 group-hover:text-stone-600',
                    isOpen ? 'rotate-0' : '-rotate-90'
                  )} />
                </button>
              ) : (
                /* Collapsed: thin separator between groups */
                i > 0 && <div className="mx-3 my-2 h-px bg-stone-200/70" />
              )}

              {/* Items */}
              {(showFull ? isOpen : true) && (
                <div className={cn('space-y-[2px]', showFull ? 'px-2 pb-1' : 'px-1.5')}>
                  {group.items.map(item => {
                    const active = isActive(item.href, item.exact);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={!showFull ? item.label : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg text-[13.5px] font-medium transition-all duration-150',
                          showFull ? 'pl-4 pr-3 py-2' : 'py-2.5 justify-end pr-2',
                          active
                            ? 'text-white shadow-sm'
                            : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80'
                        )}
                        style={active ? {
                          background: 'linear-gradient(135deg, #c47d0e 0%, #b8860b 50%, #96670a 100%)',
                          boxShadow: '0 2px 8px rgba(184,134,11,0.30)',
                        } : undefined}
                      >
                        <item.icon className={cn('h-[15px] w-[15px] shrink-0', active ? 'text-white/90' : 'text-stone-500')} />
                        {showFull && <span className="truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div
        className="shrink-0 p-3 space-y-1"
        style={{ borderTop: '1px solid rgba(214, 199, 168, 0.5)' }}
      >
        {/* User card */}
        {user && showFull && (
          <div
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl mb-1"
            style={{ background: 'linear-gradient(135deg, #fdf5e0 0%, #faf0d0 100%)' }}
          >
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #c47d0e, #b8860b)' }}
            >
              {getInitials(user.prenom, user.nom)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-stone-800 truncate leading-tight">
                {user.prenom} {user.nom}
              </p>
              <p className="text-[11px] text-stone-500 truncate">{user.email}</p>
            </div>
          </div>
        )}

        {/* Collapsed: small avatar */}
        {user && !showFull && (
          <div
            className="mx-auto h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm mb-1"
            style={{ background: 'linear-gradient(135deg, #c47d0e, #b8860b)' }}
          >
            {getInitials(user.prenom, user.nom)}
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={!showFull ? 'Déconnexion' : undefined}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-150',
            'text-stone-500 hover:text-red-500 hover:bg-red-50/70',
            !showFull && 'justify-center px-0'
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {showFull && <span className="font-medium">Déconnexion</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
