'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePermissionsStore } from '@/stores/usePermissionsStore';

/**
 * Indique si l'utilisateur possède au moins un des droits demandés (`domaine:VERBE`).
 * Déclenche le chargement des droits au premier usage, une fois la session établie.
 */
export function useCan() {
  const isAuth = useAuthStore((s) => s.is_authenticated);
  const { droits, roles, loaded, charger } = usePermissionsStore();

  useEffect(() => {
    if (isAuth && !loaded) void charger();
  }, [isAuth, loaded, charger]);

  return {
    loaded,
    roles,
    can: (...codes: string[]) => codes.some((c) => droits.has(c)),
  };
}
