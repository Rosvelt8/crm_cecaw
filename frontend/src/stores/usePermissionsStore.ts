import { create } from 'zustand';
import { adminService } from '@/services/adminService';

interface PermissionsStore {
  droits: Set<string>;
  roles: string[];
  loaded: boolean;
  loading: boolean;
  charger: () => Promise<void>;
  reset: () => void;
}

/**
 * Droits effectifs de l'utilisateur connecté, tels que calculés par le serveur.
 *
 * Ils ne servent qu'à afficher ou masquer menus et boutons : l'autorisation
 * réelle est toujours revérifiée par l'API, un droit masqué ici n'est donc pas
 * une protection mais un confort.
 */
export const usePermissionsStore = create<PermissionsStore>((set, get) => ({
  droits: new Set(),
  roles: [],
  loaded: false,
  loading: false,

  charger: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { droits, roles } = await adminService.moi();
      set({ droits: new Set(droits), roles, loaded: true, loading: false });
    } catch {
      // Serveur ancien sans /rbac/me, ou session expirée : on ne bloque pas l'interface.
      set({ droits: new Set(), roles: [], loaded: true, loading: false });
    }
  },

  reset: () => set({ droits: new Set(), roles: [], loaded: false, loading: false }),
}));
