'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';

export type StorageRole = 'admin' | 'manager' | 'backoffice' | 'agent';

const SLUG_TO_ROLE: Record<string, StorageRole> = {
  // Backend roles (direct mapping)
  admin:      'admin',
  manager:    'manager',
  backoffice: 'backoffice',
  agent:      'agent',
  // Legacy role slugs → mapped to backend equivalents
  super_admin:           'admin',
  directeur_general:     'admin',
  responsable_agence:    'manager',
  responsable_marketing: 'manager',
  superviseur_terrain:   'manager',
  caissier:              'backoffice',
  analyste_credit:       'backoffice',
  auditeur:              'backoffice',
  agent_terrain:         'agent',
};

export interface AuthPerms {
  utilisateurId: string | null;
  storageRole: StorageRole;
  isAgent: boolean;
  canDelete: boolean;
  canAccessParametres: boolean;
  canAccessLogs: boolean;
  canAccessStats: boolean;
  canManageObjectifs: boolean;
  canSeeAllData: boolean;
}

export function useAuth(): AuthPerms {
  const user  = useAuthStore((s) => s.user);

  return useMemo(() => {
    const utilisateurId = user?.id?.toString() ?? null;

    // Support both backend string role and legacy object role
    const slug: string =
      typeof user?.role === 'string'
        ? (user.role as string)
        : (user?.role as any)?.slug ?? '';

    const storageRole  = SLUG_TO_ROLE[slug] ?? 'agent';
    const isAgent      = storageRole === 'agent';

    return {
      utilisateurId,
      storageRole,
      isAgent,
      canDelete:           storageRole !== 'agent',
      canAccessParametres: storageRole === 'admin' || storageRole === 'manager',
      canAccessLogs:       storageRole !== 'agent',
      canAccessStats:      storageRole !== 'agent',
      canManageObjectifs:  storageRole !== 'agent',
      canSeeAllData:       storageRole !== 'agent',
    };
  }, [user]);
}
