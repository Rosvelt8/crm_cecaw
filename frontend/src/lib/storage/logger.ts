import type { Log } from './types';
import { STORAGE_KEYS } from './useStore';

type LogParams = Omit<Log, 'id' | 'timestamp' | 'utilisateurId' | 'utilisateurLabel' | 'agenceId'>;

function getCurrentUser(): { utilisateurId: string; utilisateurLabel: string; agenceId: string } {
  if (typeof window === 'undefined') return { utilisateurId: 'system', utilisateurLabel: 'Système', agenceId: '' };
  try {
    const token = localStorage.getItem('cecaw_access_token') ?? '';
    if (!token.startsWith('cecaw_local_')) return { utilisateurId: 'system', utilisateurLabel: 'Système', agenceId: '' };
    const utilisateurId = token.slice('cecaw_local_'.length);
    const raw = localStorage.getItem(STORAGE_KEYS.utilisateurs);
    const utilisateurs: any[] = raw ? JSON.parse(raw) : [];
    const u = utilisateurs.find((x) => x.id === utilisateurId);
    return {
      utilisateurId,
      utilisateurLabel: u ? `${u.prenom} ${u.nom}` : utilisateurId,
      agenceId: u?.agenceId ?? '',
    };
  } catch {
    return { utilisateurId: 'system', utilisateurLabel: 'Système', agenceId: '' };
  }
}

export function addLog(params: LogParams): void {
  if (typeof window === 'undefined') return;
  const { utilisateurId, utilisateurLabel, agenceId } = getCurrentUser();
  const entry: Log = {
    ...params,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    utilisateurId,
    utilisateurLabel,
    agenceId,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.logs);
    const existing: Log[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify([entry, ...existing]));
  } catch { /* silently ignore */ }
}

export const log = {
  marketing:  (action: string, entiteType: string, entiteId: string, description: string, impact: string) =>
    addLog({ module: 'marketing',  action, entiteType, entiteId, description, impact }),
  collecte:   (action: string, entiteType: string, entiteId: string, description: string, impact: string) =>
    addLog({ module: 'collecte',   action, entiteType, entiteId, description, impact }),
  parametres: (action: string, entiteType: string, entiteId: string, description: string, impact: string) =>
    addLog({ module: 'parametres', action, entiteType, entiteId, description, impact }),
};
