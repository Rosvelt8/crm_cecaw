import apiClient from '@/lib/axios';
import type {
  DemandeCreditListe, DemandeCreditDetail, Simulation, PayloadDemande, GrilleForm, ResultatGrille, ResultatBilan,
  Periodicite, TypeGarantie, ModeReglement, Echeance,
} from '@/types/credit';

/** Corps commun de l'API : { success, data, meta? }. On ne renvoie que le contenu utile. */
const data = <T,>(r: { data: { data: T } }) => r.data.data;

export const creditService = {
  lister: async (params: Record<string, unknown> = {}) => {
    const { data: body } = await apiClient.get('/credits', { params });
    return { data: (body.data ?? []) as DemandeCreditListe[], meta: body.meta as { page: number; per_page: number; total: number } };
  },

  obtenir: async (id: number | string) => data<DemandeCreditDetail>(await apiClient.get(`/credits/${id}`)),

  simuler: async (payload: { produit_id: number; montant: number; duree_mois: number; periodicite: Periodicite; differe_mois?: number; client_id?: number }) =>
    data<Simulation>(await apiClient.post('/credits/simulation', payload)),

  creer: async (payload: PayloadDemande) => data<{ id: number; reference: string }>(await apiClient.post('/credits', payload)),
  soumettre: async (id: number) => data<{ statut: string }>(await apiClient.post(`/credits/${id}/soumettre`)),
  annuler: async (id: number, motif: string) => data<{ statut: string }>(await apiClient.post(`/credits/${id}/annuler`, { motif })),

  ajouterGarantie: async (id: number, p: { type: TypeGarantie; description: string; valeur_estimee: number; valeur_retenue?: number; reference?: string }) =>
    data(await apiClient.post(`/credits/${id}/garanties`, p)),
  supprimerGarantie: async (id: number, gid: number) => { await apiClient.delete(`/credits/${id}/garanties/${gid}`); },
  ajouterGarant: async (id: number, p: { nom: string; prenom?: string; telephone: string; profession?: string; revenu_mensuel?: number; lien_parente?: string }) =>
    data(await apiClient.post(`/credits/${id}/garants`, p)),
  supprimerGarant: async (id: number, gid: number) => { await apiClient.delete(`/credits/${id}/garants/${gid}`); },

  enregistrerVisite: async (id: number, form: FormData) =>
    data(await apiClient.post(`/credits/${id}/visites`, form, { headers: { 'Content-Type': 'multipart/form-data' } })),

  // ── Grille d'analyse ────────────────────────────────────────────────────
  obtenirGrille: async (id: number | string) =>
    data<{
      demande: { id: number; reference: string; statut: string };
      grille: (Record<string, unknown> & { bilan: Record<string, unknown> | null }) | null;
      precedente: (Record<string, unknown> & { bilan: Record<string, unknown> | null; demande: { reference: string } }) | null;
      alertes: string[];
    }>(await apiClient.get(`/credits/${id}/grille`)),

  sauvegarderGrille: async (id: number, form: GrilleForm) => data(await apiClient.put(`/credits/${id}/grille`, form)),

  apercuGrille: async (form: GrilleForm, demandeId?: number) =>
    data<{ grille: ResultatGrille; bilan: ResultatBilan; mensualite_proposee: number | null }>(
      await apiClient.post('/credits/grille/apercu', { ...form, demande_id: demandeId }),
    ),

  terminerAnalyse: async (id: number) =>
    data<{ statut: string; score: { valeur: number; classe: string; detail: { critere: string; points: number; max: number; detail: string }[] } }>(
      await apiClient.post(`/credits/${id}/analyse/terminer`),
    ),

  // ── Décision et suites ──────────────────────────────────────────────────
  decider: async (id: number, p: { sens: 'favorable' | 'defavorable' | 'ajourne'; montant_accorde?: number; duree_accordee_mois?: number; taux_accorde?: number; conditions?: string; motif?: string }) =>
    data<{ statut: string; instance: string }>(await apiClient.post(`/credits/${id}/decision`, p)),
  editerContrat: async (id: number) => data(await apiClient.post(`/credits/${id}/contrat`)),
  signerContrat: async (id: number) => data(await apiClient.post(`/credits/${id}/contrat/signer`)),
  decaisser: async (id: number, p: { mode: ModeReglement; compte_id?: number; reference?: string; deduire_frais?: boolean }) =>
    data<{ montant: number; montant_net: number; nb_echeances: number }>(await apiClient.post(`/credits/${id}/decaissement`, p)),
  echeances: async (id: number) => data<{ echeances: Echeance[]; remboursements: { id: number; montant: string; datePaiement: string; mode: string }[] }>(await apiClient.get(`/credits/${id}/echeances`)),
  rembourser: async (id: number, p: { montant: number; mode: ModeReglement; compte_id?: number; echeance_id?: number; reference?: string }) =>
    data<{ solde_restant: number; cloture: boolean }>(await apiClient.post(`/credits/${id}/remboursements`, p)),
  avenant: async (id: number, p: { type: 'restructuration' | 'reechelonnement' | 'refinancement'; motif: string; nouvelle_duree_mois: number; nouveau_taux?: number; nouveau_montant?: number }) =>
    data(await apiClient.post(`/credits/${id}/avenants`, p)),
};
