'use client';

import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePermissionsStore } from '@/stores/usePermissionsStore';

export type StorageRole = 'admin' | 'manager' | 'backoffice' | 'agent';

const SLUG_TO_ROLE: Record<string, StorageRole> = {
  admin:      'admin',
  manager:    'manager',
  backoffice: 'backoffice',
  agent:      'agent',
};

// Droits (domaine:VERBE) qui donnent accès à au moins un écran du module Paramètres — miroir du
// filtrage déjà fait par item dans components/layout/Sidebar.tsx pour le groupe "parametres".
const DROITS_PARAMETRES = [
  'organisation:VIEW', 'organisation:CREATE',
  'produits:VIEW', 'produits:CONFIGURE',
  'socle:VIEW', 'socle:CREATE', 'socle:UPDATE',
  'securite:VIEW', 'securite:CONFIGURE',
  'administration:VIEW', 'administration:CONFIGURE',
  'communication:VIEW', 'communication:CONFIGURE',
  'integration:VIEW', 'integration:CONFIGURE',
];

export interface AuthPerms {
  utilisateurId: string | null;
  storageRole: StorageRole;
  /**
   * Rôle historique (agent de terrain) : reflète encore la logique de périmètre appliquée
   * côté serveur dans plusieurs modules non migrés vers le RBAC fin (ex. clients.service.ts,
   * objectifs.service.ts scopent par `actor.role === 'agent'`). Ne pas remplacer par un droit
   * RBAC sans vérifier d'abord le module backend concerné.
   */
  isAgent: boolean;
  /** true une fois les droits RBAC chargés : à vérifier avant d'interpréter les drapeaux ci-dessous. */
  loaded: boolean;
  /** Au moins un écran du module Paramètres est accessible (droits réels, pas le rôle historique). */
  canAccessParametres: boolean;
  /** Réinitialiser le mot de passe d'un utilisateur (droit `socle:EXECUTE`, ex. R01, R04). */
  canResetUserPassword: boolean;
  /** Journal d'activité (droit `socle:VIEW`/`socle:AUDIT`/`conformite:AUDIT`, requis par GET /logs). */
  canAccessLogs: boolean;
  /** Statistiques et KPI (droit `analytique:EXPORT`, requis par GET /stats/kpis notamment). */
  canAccessStats: boolean;
}

export function useAuth(): AuthPerms {
  const user = useAuthStore((s) => s.user);
  const isAuthStore = useAuthStore((s) => s.is_authenticated);
  const { droits, loaded, charger } = usePermissionsStore();

  useEffect(() => {
    if (isAuthStore && !loaded) void charger();
  }, [isAuthStore, loaded, charger]);

  return useMemo(() => {
    const utilisateurId = user?.id?.toString() ?? null;

    // Support both backend string role and legacy object role
    const slug: string =
      typeof user?.role === 'string'
        ? (user.role as string)
        : (user?.role as any)?.slug ?? '';

    const storageRole = SLUG_TO_ROLE[slug] ?? 'agent';
    const isAgent = storageRole === 'agent';
    const can = (...codes: string[]) => codes.some((c) => droits.has(c));

    return {
      utilisateurId,
      storageRole,
      isAgent,
      loaded,
      canAccessParametres: can(...DROITS_PARAMETRES),
      canResetUserPassword: can('socle:EXECUTE'),
      canAccessLogs: can('socle:VIEW', 'socle:AUDIT', 'conformite:AUDIT'),
      canAccessStats: can('analytique:EXPORT'),
    };
  }, [user, droits, loaded]);
}
