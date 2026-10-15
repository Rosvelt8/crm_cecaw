import apiClient from '@/lib/axios';
import { donnees } from '@/lib/apiHelpers';

/** Contrôle de sanctions (OFAC, ONU, UE, listes locales). Chemins de l'API : /conformite/screenings, /conformite/sanctions. */

export type ListeSanction = 'sdn' | 'non_sdn' | 'onu' | 'ue' | 'locale';

export type StatutScreening = 'aucune_correspondance' | 'correspondance_potentielle' | 'correspondance_confirmee' | 'erreur_technique';
export type RevueStatut = 'non_requise' | 'a_revoir' | 'escaladee' | 'revue';
export type DecisionRevue = 'faux_positif' | 'correspondance_confirmee' | 'escalade';
export type Confiance = 'faible' | 'moyenne' | 'forte';

export interface CorrespondanceOfac {
  entree_id: number; liste: ListeSanction; uid: number; reference: string | null; type: 'individu' | 'entite'; nom: string; programmes: string[];
  score: number; confiance: Confiance; raison: 'nom' | 'identifiant'; champ: 'nom' | 'entreprise';
  nom_rapproche: string; via: 'principal' | 'alias'; type_alias: string | null; nom_controle: string; nom_courant: boolean;
  indices: { naissance: 'exacte' | 'annee' | 'proche' | 'incompatible' | 'inconnue'; pays: 'concordant' | 'different' | 'inconnu'; identifiant: string | null };
  naissances: string[]; nationalites: string[]; pays: string[]; identifiants: { type: string; valeur: string; pays: string | null }[];
  titre: string | null; extrait_remarques: string | null; empreinte_entree: string; ecartee_le?: string;
}

/** Vue d'un contrôle. Les champs de détail n'existent que pour la conformité (`conformite:VIEW`). */
export interface Controle {
  id: number; reference: string; client_id: number | null; prospect_id: number | null; statut: StatutScreening; message: string;
  revue_statut: RevueStatut; declencheur: 'manuel' | 'automatique' | 'surveillance_continue'; created_at: string; avertissements: string[];
  controle: { nom: string; prenom: string | null; type_personne: 'physique' | 'morale'; alias: string[]; date_naissance: string | null; pays: string | null; entreprise: string | null };
  score_max?: number | null; seuil?: number; nb_correspondances?: number; numero_piece?: string | null;
  correspondances?: CorrespondanceOfac[]; ecartees?: CorrespondanceOfac[]; non_retenues?: CorrespondanceOfac[]; statut_initial?: StatutScreening;
  versions_listes?: { liste: string; synchro_id: number; a_jour_au: string | null; nb_entrees: number }[]; erreur?: string | null;
  revue?: { decision: DecisionRevue; commentaire: string; revue_par_id: number; revue_at: string } | null; alerte_id?: number | null;
}

export interface LigneControle {
  id: number; reference: string; statut: StatutScreening; revue_statut: RevueStatut; decision: DecisionRevue | null; score_max: number | null;
  nb_correspondances: number; nom: string; client_id: number | null; prospect_id: number | null; declencheur: string; created_at: string;
}

export interface DemandeControle {
  client_id?: number; prospect_id?: number; type_personne?: 'physique' | 'morale'; nom?: string; prenom?: string; alias?: string[];
  date_naissance?: string; pays?: string; entreprise?: string; numero_piece?: string;
}

export interface EtatListeOfac {
  liste: ListeSanction; libelle: string; autorite: string; page_officielle: string; active: boolean; souhaitee: boolean; configuree: boolean; aide_configuration: string | null; nb_entrees: number; a_jour_au: string | null; age_jours: number | null; obsolete: boolean;
  derniere_modification_at: string | null; derniere_tentative: { statut: string; at: string; erreur: string | null } | null;
}

export const screeningApi = {
  lancer: async (b: DemandeControle) => donnees<Controle>(await apiClient.post('/conformite/screenings', b)),
  obtenir: async (id: number) => donnees<Controle>(await apiClient.get(`/conformite/screenings/${id}`)),
  lister: async (p: Record<string, unknown>) => {
    const { data } = await apiClient.get('/conformite/screenings', { params: p });
    return { items: (data.data ?? []) as LigneControle[], meta: (data.meta ?? {}) as { page?: number; per_page?: number; total?: number } };
  },
  compteurs: async () => donnees<{ par_revue: Record<string, number>; par_statut: Record<string, number> }>(await apiClient.get('/conformite/screenings/compteurs')),
  reviser: async (id: number, b: { decision: DecisionRevue; commentaire: string; entree_ids?: number[] }) => donnees<Controle>(await apiClient.post(`/conformite/screenings/${id}/revue`, b)),
  historique: async (cible: 'client' | 'prospect', id: number) => donnees<Controle[]>(await apiClient.get(`/conformite/${cible === 'client' ? 'clients' : 'prospects'}/${id}/historique`)),
  etat: async () => donnees<{ age_max_jours: number; listes: EtatListeOfac[] }>(await apiClient.get('/conformite/sanctions/etat')),
  synchroniser: async (opts: { forcer?: boolean; liste?: ListeSanction } = {}) => donnees<{ liste: ListeSanction; statut: string; entrees: number; ajoutees: number; modifiees: number; retirees: number; erreur?: string }[]>(await apiClient.post('/conformite/sanctions/synchroniser', opts)),
  depisterPortefeuille: async (liste?: ListeSanction) => donnees<{ message: string }>(await apiClient.post('/conformite/sanctions/depistage-portefeuille', liste ? { liste } : {})),
};
