import type { User, Role, BackendRole } from '@/types/user';

const ROLE_NAMES: Record<BackendRole, string> = {
  admin:      'Administrateur',
  manager:    'Manager',
  backoffice: 'Back-office',
  agent:      'Agent Terrain',
};

/**
 * Converts a raw backend user object into the frontend User shape.
 * The backend returns role as a plain string; we wrap it in a Role object
 * so existing UI code that reads user.role.slug continues to work.
 */
export function mapBackendUser(raw: any): User {
  const roleSlug = (raw.role ?? 'agent') as BackendRole;

  const role: Role = {
    id: 0,
    name: ROLE_NAMES[roleSlug] ?? roleSlug,
    slug: roleSlug,
    permissions: [],
  };

  return {
    id: raw.id,
    nom: raw.nom,
    prenom: raw.prenom,
    email: raw.email,
    telephone: raw.telephone,
    photo_url: raw.photo_url,
    role,
    roleString: roleSlug,
    fonction: raw.fonction ?? null,
    actif: raw.actif ?? true,
    statut: raw.actif === false ? 'suspendu' : 'actif',
    agence_id: raw.agence?.id ?? raw.agenceId,
    agence: raw.agence
      ? { id: raw.agence.id, nom: raw.agence.nom }
      : undefined,
    equipe_id: raw.equipe?.id ?? raw.equipeId,
    equipe: raw.equipe
      ? { id: raw.equipe.id, nom: raw.equipe.nom }
      : undefined,
    created_at: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updated_at: raw.updated_at ?? raw.updatedAt,
    mfa_enabled: false,
  };
}
