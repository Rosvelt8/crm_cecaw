import apiClient from '@/lib/axios';

const data = <T,>(r: { data: { data: T } }) => r.data.data;

export type StatutKyc = 'brouillon' | 'en_controle' | 'valide' | 'rejete' | 'archive';
export type NiveauRisque = 'faible' | 'moyen' | 'eleve';

export interface DossierKycListe {
  id: number; reference: string; statut: StatutKyc; niveauRisque: NiveauRisque | null; scoreLcbft: number | null; createdAt: string;
  client: { id: number; nom: string; prenom: string | null } | null;
  prospect: { id: number; nom: string; prenom: string | null } | null;
  creePar: { id: number; prenom: string; nom: string };
}

export interface ControleKyc { id: number; code: string; libelle: string; resultat: 'conforme' | 'non_conforme' | 'non_applicable' | null; commentaire: string | null }

export interface DossierKycDetail extends DossierKycListe {
  motifRejet: string | null;
  validePar: { id: number; prenom: string; nom: string } | null;
  controles: ControleKyc[];
  piecesIdentite: { id: number; type: string; numero: string; dateExpiration: string | null; autoriteDelivrance: string | null }[];
  piecesJointes: { id: number; intitule: string; url: string; version: number; nomFichier: string }[];
  actes: { id: number; etape: string; commentaire: string | null; createdAt: string; acteur: { prenom: string; nom: string } }[];
}

export const kycService = {
  lister: async (params: Record<string, unknown> = {}) => {
    const { data: body } = await apiClient.get('/kyc/dossiers', { params });
    return { data: (body.data ?? []) as DossierKycListe[], meta: body.meta as { total: number } };
  },
  obtenir: async (id: number | string) => data<DossierKycDetail>(await apiClient.get(`/kyc/dossiers/${id}`)),
  creer: async (p: { client_id?: number; prospect_id?: number }) => data<{ id: number; reference: string }>(await apiClient.post('/kyc/dossiers', p)),
  evaluerControle: async (id: number, cid: number, p: { resultat: 'conforme' | 'non_conforme' | 'non_applicable'; commentaire?: string }) =>
    data(await apiClient.put(`/kyc/dossiers/${id}/controles/${cid}`, p)),
  ajouterPiece: async (id: number, form: FormData) =>
    data(await apiClient.post(`/kyc/dossiers/${id}/pieces-identite`, form, { headers: { 'Content-Type': 'multipart/form-data' } })),
  joindre: async (id: number, form: FormData) =>
    data(await apiClient.post(`/kyc/dossiers/${id}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } })),
  soumettre: async (id: number) => data(await apiClient.post(`/kyc/dossiers/${id}/soumettre`)),
  valider: async (id: number, niveau_risque?: NiveauRisque) =>
    data<{ niveau_risque: NiveauRisque; score_lcbft: number; facteurs: string[] }>(await apiClient.post(`/kyc/dossiers/${id}/valider`, { niveau_risque })),
  rejeter: async (id: number, motif: string) => data(await apiClient.post(`/kyc/dossiers/${id}/rejeter`, { motif })),
  rouvrir: async (id: number) => data(await apiClient.post(`/kyc/dossiers/${id}/rouvrir`)),
  archiver: async (id: number) => data(await apiClient.post(`/kyc/dossiers/${id}/archiver`)),
};
