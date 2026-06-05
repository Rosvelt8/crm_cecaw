/**
 * Local authentication — no backend.
 * Authenticates users against the seedUtilisateurs stored in localStorage.
 * Default password for all accounts: Cecaw2025!
 */

import type { Utilisateur } from './storage/types';
import { seedUtilisateurs } from './storage/seeds';
import type { User } from '@/types/user';
import type { UserRole } from '@/types/user';

export const DEFAULT_PASSWORD = 'Cecaw2025!';

const TOKEN_PREFIX    = 'cecaw_local_';
const PASSWORDS_KEY   = 'cecaw_passwords';

function readPasswords(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(PASSWORDS_KEY) ?? '{}'); } catch { return {}; }
}
function savePasswords(m: Record<string, string>) {
  localStorage.setItem(PASSWORDS_KEY, JSON.stringify(m));
}

export function resetPassword(utilisateurId: string): void {
  const m = readPasswords();
  delete m[utilisateurId];
  savePasswords(m);
}

export function changePassword(utilisateurId: string, newPassword: string): void {
  const m = readPasswords();
  m[utilisateurId] = newPassword;
  savePasswords(m);
}

// ─── Role mapping ─────────────────────────────────────────────────────────────

const ROLE_MAP: Record<
  Utilisateur['role'],
  { id: number; name: string; slug: UserRole }
> = {
  admin:      { id: 1, name: 'Administrateur',  slug: 'admin' },
  manager:    { id: 2, name: 'Manager',          slug: 'responsable_agence' },
  backoffice: { id: 3, name: 'Back-office',      slug: 'caissier' },
  agent:      { id: 4, name: 'Agent Terrain',    slug: 'agent_terrain' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readUtilisateurs(): Utilisateur[] {
  if (typeof window === 'undefined') return seedUtilisateurs;
  try {
    const raw = localStorage.getItem('cecaw_utilisateurs');
    return raw ? (JSON.parse(raw) as Utilisateur[]) : seedUtilisateurs;
  } catch {
    return seedUtilisateurs;
  }
}

export function utilisateurToUser(u: Utilisateur): User {
  const roleInfo = ROLE_MAP[u.role] ?? ROLE_MAP.agent;
  return {
    // Use numeric suffix of the id string (u-1 → 1, u-2 → 2 …)
    id: parseInt(u.id.replace(/\D/g, ''), 10) || 0,
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    role: { ...roleInfo, permissions: [] },
    statut: u.actif ? 'actif' : 'inactif',
    agence_id: undefined,
    mfa_enabled: false,
    created_at: u.createdAt,
    updated_at: u.createdAt,
  } as User;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type LocalLoginResult =
  | { ok: true; user: User; utilisateurId: string }
  | { ok: false; reason: 'not_found' | 'wrong_password' | 'inactive' };

export function localLogin(email: string, password: string): LocalLoginResult {
  const utilisateurs = readUtilisateurs();
  const u = utilisateurs.find(
    (x) => x.email.trim().toLowerCase() === email.trim().toLowerCase(),
  );

  if (!u) return { ok: false, reason: 'not_found' };
  if (!u.actif) return { ok: false, reason: 'inactive' };
  const passwords = readPasswords();
  const expected = passwords[u.id] ?? DEFAULT_PASSWORD;
  if (password !== expected) return { ok: false, reason: 'wrong_password' };

  return { ok: true, user: utilisateurToUser(u), utilisateurId: u.id };
}

export function makeLocalToken(utilisateurId: string): string {
  return TOKEN_PREFIX + utilisateurId;
}

export function getUserFromToken(token: string): User | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const utilisateurId = token.slice(TOKEN_PREFIX.length);
  const utilisateurs = readUtilisateurs();
  const u = utilisateurs.find((x) => x.id === utilisateurId);
  if (!u || !u.actif) return null;
  return utilisateurToUser(u);
}

/** Exposed for login page — shows all active utilisateurs with their role label */
export function getActiveAccounts(): { email: string; nom: string; prenom: string; role: string }[] {
  const utilisateurs = readUtilisateurs();
  return utilisateurs
    .filter((u) => u.actif)
    .map((u) => ({
      email: u.email,
      nom: u.nom,
      prenom: u.prenom,
      role: ROLE_MAP[u.role]?.name ?? u.role,
    }));
}
