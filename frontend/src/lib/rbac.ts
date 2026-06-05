import type { UserRole } from '@/types/user';

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // ── Backend roles ──────────────────────────────────────────────────────────
  admin: ['*'],
  manager: [
    'users:read', 'clients:*', 'credits:read', 'credits:create', 'credits:update',
    'epargne:*', 'objectifs:*', 'reporting:read', 'geolocalisation:read',
    'notifications:*', 'equipes:read', 'parametres:read', 'agents:read', 'logs:read',
  ],
  backoffice: [
    'clients:read', 'credits:read', 'credits:analyse', 'credits:create', 'credits:update',
    'epargne:read', 'epargne:create', 'reporting:read', 'notifications:read',
    'objectifs:read',
  ],
  agent: [
    'clients:read', 'clients:create', 'clients:update',
    'epargne:read', 'epargne:create', 'credits:read', 'credits:create',
    'objectifs:read', 'geolocalisation:update', 'notifications:read',
  ],
  // ── Legacy roles (kept for backwards-compat) ──────────────────────────────
  super_admin: ['*'],
  admin_legacy: ['*'],
  directeur_general: [
    'users:read', 'clients:read', 'credits:read', 'credits:approve',
    'epargne:read', 'objectifs:*', 'reporting:*', 'geolocalisation:read',
    'dashboard:*', 'notifications:read',
  ],
  responsable_agence: [
    'users:read', 'clients:*', 'credits:read', 'credits:create',
    'credits:update', 'credits:analyse', 'epargne:*',
    'objectifs:read', 'objectifs:update', 'reporting:read',
    'geolocalisation:read', 'notifications:*', 'equipes:read',
  ],
  responsable_marketing: [
    'clients:read', 'clients:create', 'clients:update',
    'prospects:*', 'pipeline:*', 'objectifs:read',
    'reporting:read', 'notifications:read',
  ],
  analyste_credit: [
    'clients:read', 'credits:read', 'credits:analyse',
    'credits:create', 'credits:update', 'garanties:*',
    'reporting:read', 'notifications:read',
  ],
  superviseur_terrain: [
    'clients:read', 'clients:update', 'credits:read',
    'epargne:read', 'geolocalisation:read', 'geolocalisation:update',
    'objectifs:read', 'reporting:read', 'notifications:read',
    'equipes:read', 'agents:read',
  ],
  agent_terrain: [
    'clients:read', 'clients:create', 'clients:update',
    'epargne:read', 'epargne:create', 'credits:read',
    'credits:create', 'objectifs:read', 'geolocalisation:update',
    'notifications:read',
  ],
  auditeur: [
    'clients:read', 'credits:read', 'epargne:read',
    'users:read', 'reporting:read', 'objectifs:read', 'notifications:read',
  ],
  caissier: [
    'epargne:read', 'epargne:create', 'clients:read', 'notifications:read',
  ],
};

export function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;

  const [module] = permission.split(':');
  if (perms.includes(`${module}:*`)) return true;

  return perms.includes(permission);
}

export function hasAnyPermission(role: string, permissions: string[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(role: string, permissions: string[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function canAccessRoute(role: string, route: string): boolean {
  const routePermissions: Record<string, string[]> = {
    '/dashboard': [],
    '/dashboard/utilisateurs': ['users:read'],
    '/dashboard/clients': ['clients:read'],
    '/dashboard/prospects': ['clients:read'],
    '/dashboard/credits': ['credits:read'],
    '/dashboard/epargne': ['epargne:read'],
    '/dashboard/geolocalisation': ['geolocalisation:read'],
    '/dashboard/objectifs': ['objectifs:read'],
    '/dashboard/reporting': ['reporting:read'],
    '/dashboard/notifications': ['notifications:read'],
    '/dashboard/parametres': ['parametres:read'],
    '/dashboard/logs': ['logs:read'],
  };

  const required = routePermissions[route];
  if (!required || required.length === 0) return true;
  return hasAnyPermission(role, required);
}
