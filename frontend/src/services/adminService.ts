import apiClient from '@/lib/axios';

const data = <T,>(r: { data: { data: T } }) => r.data.data;

export interface Parametrage {
  id: number; produitId: number; dateEffet: string; dateFin: string | null;
  tauxInteretAnnuel: string | null; tauxPenaliteRetard: string | null; tauxRemunerationEpargne: string | null;
  fraisDossier: string | null; fraisDossierPct: string | null; commission: string | null;
  montantMin: string | null; montantMax: string | null; dureeMinMois: number | null; dureeMaxMois: number | null;
  modeAmortissement: 'constant' | 'degressif' | 'in_fine' | null;
  ageMin: number | null; ageMax: number | null; ancienneteActiviteMinMois: number | null; quotiteCessibleMaxPct: string | null;
}

export interface RoleRef { id: number; code: string; nom: string; description: string | null; systeme: boolean; actif: boolean; nb_utilisateurs: number; droits: string[] }
export interface PermissionRef { id: number; code: string; domaine: string; verbe: string; libelle: string }
export interface ZoneRef {
  id: number; nom: string; code: string | null; type: 'zone' | 'secteur'; parentId: number | null; agenceId: number | null;
  latitude: string | null; longitude: string | null; population: number | null; potentielEstime: string | null; actif: boolean;
  agence: { id: number; nom: string } | null;
  agents: { agent: { id: number; matricule: string; utilisateur: { prenom: string; nom: string } } }[];
  _count: { clients: number; prospects: number; enfants: number };
}
export interface MarcheRef {
  id: number; nom: string; type: 'grand' | 'moyen' | 'petit'; zoneId: number | null; agenceId: number | null;
  latitude: string | null; longitude: string | null; actif: boolean;
  zone: { id: number; nom: string } | null; agence: { id: number; nom: string } | null;
  agents: { agent: { id: number; matricule: string; utilisateur: { prenom: string; nom: string } } }[];
  _count: { clients: number; prospects: number };
}
export interface MetierRef { id: number; nom: string; secteurId: number; actif: boolean }
export interface SecteurRef { id: number; nom: string; actif: boolean; metiers: MetierRef[] }
export interface PotentielMarche {
  marche_id: number; nom: string; type: string; agence: string | null;
  nb_clients: number; nb_prospects_actifs: number; nb_collecteurs: number;
  epargne_collectee: number; nb_clients_dormants: number; potentiel_moyen_clients: number | null;
}

export const adminService = {
  // Paramétrage financier des produits
  parametrages: async (produitId: number) => data<Parametrage[]>(await apiClient.get(`/parametrages/produits/${produitId}`)),
  creerParametrage: async (p: Record<string, unknown>) => data<Parametrage>(await apiClient.post('/parametrages', p)),
  definirTypeProduit: async (produitId: number, type: 'epargne' | 'credit' | 'autre') => data(await apiClient.put(`/parametrages/produits/${produitId}/type`, { type })),

  // RBAC
  moi: async () => data<{ droits: string[]; roles: string[] }>(await apiClient.get('/rbac/me')),
  roles: async () => data<RoleRef[]>(await apiClient.get('/rbac/roles')),
  permissions: async () => data<PermissionRef[]>(await apiClient.get('/rbac/permissions')),
  definirDroitsRole: async (id: number, codes: string[]) => data(await apiClient.put(`/rbac/roles/${id}/permissions`, { codes })),
  rolesUtilisateur: async (id: number) => data<{ id: number; code: string; nom: string }[]>(await apiClient.get(`/rbac/utilisateurs/${id}/roles`)),
  definirRolesUtilisateur: async (id: number, role_codes: string[]) => data(await apiClient.put(`/rbac/utilisateurs/${id}/roles`, { role_codes })),
  reglesSeparation: async () => data<{ id: number; code: string; libelle: string; actif: boolean; etapeA: string; etapeB: string }[]>(await apiClient.get('/rbac/regles-separation')),
  basculerRegle: async (id: number, actif: boolean) => data(await apiClient.put(`/rbac/regles-separation/${id}`, { actif })),

  // Organisation
  zones: async (agenceId?: number) => data<ZoneRef[]>(await apiClient.get('/organisation/zones', { params: { agence_id: agenceId } })),
  creerZone: async (p: Record<string, unknown>) => data<ZoneRef>(await apiClient.post('/organisation/zones', p)),
  modifierZone: async (id: number, p: Record<string, unknown>) => data<ZoneRef>(await apiClient.put(`/organisation/zones/${id}`, p)),
  supprimerZone: async (id: number) => { await apiClient.delete(`/organisation/zones/${id}`); },
  affecterAgentsZone: async (id: number, agents: { agent_id: number; principal?: boolean }[]) => data(await apiClient.put(`/organisation/zones/${id}/agents`, { agents })),

  // Marchés (compléments stratégiques, points 15-16)
  marches: async (params?: { agence_id?: number; zone_id?: number }) => data<MarcheRef[]>(await apiClient.get('/organisation/marches', { params })),
  marche: async (id: number) => data<MarcheRef>(await apiClient.get(`/organisation/marches/${id}`)),
  creerMarche: async (p: Record<string, unknown>) => data<MarcheRef>(await apiClient.post('/organisation/marches', p)),
  modifierMarche: async (id: number, p: Record<string, unknown>) => data<MarcheRef>(await apiClient.put(`/organisation/marches/${id}`, p)),
  supprimerMarche: async (id: number) => { await apiClient.delete(`/organisation/marches/${id}`); },
  affecterAgentsMarche: async (id: number, agents: { agent_id: number; principal?: boolean }[]) => data(await apiClient.put(`/organisation/marches/${id}/agents`, { agents })),
  potentielMarches: async (agenceId?: number) => data<PotentielMarche[]>(await apiClient.get('/sig/marches/potentiel', { params: { agence_id: agenceId } })),

  // Référentiel secteurs / métiers (compléments stratégiques, point 8)
  secteurs: async () => data<SecteurRef[]>(await apiClient.get('/organisation/secteurs')),
  creerSecteur: async (nom: string) => data<SecteurRef>(await apiClient.post('/organisation/secteurs', { nom })),
  modifierSecteur: async (id: number, p: { nom?: string; actif?: boolean }) => data<SecteurRef>(await apiClient.put(`/organisation/secteurs/${id}`, p)),
  creerMetier: async (nom: string, secteurId: number) => data<MetierRef>(await apiClient.post('/organisation/metiers', { nom, secteurId })),
  modifierMetier: async (id: number, p: { nom?: string; actif?: boolean }) => data<MetierRef>(await apiClient.put(`/organisation/metiers/${id}`, p)),

  // Archives
  archives: async (entite_type: 'demande_credit' | 'dossier_kyc', entite_id: number) =>
    data<{ id: number; reference: string; version: number; hash: string; motif: string | null; archiveAt: string; archivePar: { prenom: string; nom: string } | null }[]>(
      await apiClient.get('/archives', { params: { entite_type, entite_id } }),
    ),
  archiver: async (entite_type: 'demande_credit' | 'dossier_kyc', entite_id: number, motif?: string) =>
    data<{ id: number; version: number }>(await apiClient.post('/archives', { entite_type, entite_id, motif })),
  verifierArchive: async (id: number) =>
    data<{ integre: boolean; hash_scelle: string; hash_recalcule: string; version: number }>(await apiClient.get(`/archives/${id}/verifier`)),
};
