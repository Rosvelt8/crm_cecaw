/* eslint-disable @typescript-eslint/no-explicit-any -- réponses d'API volumineuses : typées à l'usage dans chaque page */
import apiClient from '@/lib/axios';
import { donnees } from '@/lib/apiHelpers';

type Q = Record<string, unknown>;
const get = async <T = any>(url: string, params?: Q) => donnees<T>(await apiClient.get(url, { params }));
const post = async <T = any>(url: string, body?: unknown) => donnees<T>(await apiClient.post(url, body));
const put = async <T = any>(url: string, body?: unknown) => donnees<T>(await apiClient.put(url, body));
const del = async (url: string) => { await apiClient.delete(url); };
/** Listes paginées : renvoie aussi `meta`. */
const liste = async <T = any>(url: string, params?: Q) => {
  const { data: b } = await apiClient.get(url, { params });
  return { items: (b.data ?? []) as T[], meta: (b.meta ?? {}) as { page?: number; per_page?: number; total?: number; non_lues?: number } };
};

// ── Recouvrement ────────────────────────────────────────────────────────────
export const recouvrementApi = {
  tableau: (agence_id?: number) => get('/recouvrement/tableau-de-bord', { agence_id }),
  lister: (p: Q) => liste('/recouvrement', p),
  obtenir: (id: number | string) => get(`/recouvrement/${id}`),
  detecter: () => post('/recouvrement/detection'),
  assigner: (id: number, agent_id: number) => put(`/recouvrement/${id}/agent`, { agent_id }),
  relancer: (id: number, b: Q) => post(`/recouvrement/${id}/relances`, b),
  promesse: (id: number, b: Q) => post(`/recouvrement/${id}/promesses`, b),
  traiterPromesse: (id: number, pid: number, b: Q) => put(`/recouvrement/${id}/promesses/${pid}`, b),
  plan: (id: number, b: Q) => post(`/recouvrement/${id}/plans`, b),
  validerPlan: (id: number, planId: number) => post(`/recouvrement/${id}/plans/${planId}/valider`),
  escalade: (id: number, b: Q) => post(`/recouvrement/${id}/escalade`, b),
  localiser: (id: number, latitude: number, longitude: number) => put(`/recouvrement/${id}/localisation`, { latitude, longitude }),
};

// ── Tournées et terrain ─────────────────────────────────────────────────────
export const tourneesApi = {
  lister: (p: Q) => get('/tournees', p),
  obtenir: (id: number | string) => get(`/tournees/${id}`),
  comparaison: (id: number | string) => get(`/tournees/${id}/comparaison`),
  generer: (b: Q) => post('/tournees/generer', b),
  planifier: (b: Q) => post('/tournees', b),
  optimiser: (id: number) => post(`/tournees/${id}/optimiser`),
  annuler: (id: number, motif: string) => post(`/tournees/${id}/annuler`, { motif }),
  arbitrer: (visiteId: number, choix: 'serveur' | 'appareil') => post(`/tournees/visites/${visiteId}/arbitrage`, { choix }),
  arrets: (agent_id: number, date: string) => get('/tournees/suivi/arrets', { agent_id, date }),
  horsZone: () => get('/tournees/suivi/hors-zone'),
};

// ── Collecte ────────────────────────────────────────────────────────────────
export const collecteApi = {
  journees: (p: Q) => liste('/collecte/journees', p),
  journee: (id: number | string) => get(`/collecte/journees/${id}`),
  controler: (id: number, decision: 'controlee' | 'rejetee', commentaire?: string) => post(`/collecte/journees/${id}/controle`, { decision, commentaire }),
  rouvrir: (id: number) => post(`/collecte/journees/${id}/rouvrir`),
  rapprocher: (id: number, montant_verse: number) => post(`/collecte/journees/${id}/rapprochement`, { montant_verse }),
  portefeuille: (agentId: number) => get(`/collecte/portefeuilles/${agentId}`),
  definirPortefeuille: (agentId: number, client_ids: number[]) => put(`/collecte/portefeuilles/${agentId}`, { client_ids }),
};

// ── SIG et territoire ───────────────────────────────────────────────────────
export const sigApi = {
  couches: (couches: string[], agence_id?: number) => get('/sig/couches', { couches: couches.join(','), agence_id }),
  analyse: (agence_id?: number) => get('/sig/territoire/analyse', { agence_id }),
  couverture: (agence_id?: number) => get('/sig/territoire/couverture-agences', { agence_id }),
  decoupage: (b: Q) => post('/sig/territoire/decoupage', b),
};

// ── Notifications et communication ──────────────────────────────────────────
export const notificationsApi = {
  lister: (p: Q) => liste('/notifications', p),
  nonLues: async () => (await get<{ non_lues: number }>('/notifications/non-lues')).non_lues,
  lire: (id: number) => post(`/notifications/${id}/lu`),
  toutLire: () => post('/notifications/lues'),
  supprimer: (id: number) => del(`/notifications/${id}`),
};
export const communicationApi = {
  declencheurs: () => get('/communication/declencheurs'),
  modifierDeclencheur: (id: number, b: Q) => put(`/communication/declencheurs/${id}`, b),
  sms: (statut?: string) => get('/communication/sms', { statut }),
  traiterSms: () => post('/communication/sms/traiter'),
  renvoyerSms: (id: number) => post(`/communication/sms/${id}/renvoyer`),
  basculerWhatsapp: (actif: boolean) => put('/communication/whatsapp', { actif }),
};
export const calendrierApi = {
  lister: (p?: { type?: string; annee?: number }) => get<any[]>('/calendrier', p),
  creer: (b: Q) => post('/calendrier', b),
  modifier: (id: number, b: Q) => put(`/calendrier/${id}`, b),
  supprimer: (id: number) => del(`/calendrier/${id}`),
};
export const campagnesApi = {
  lister: (statut?: string) => get<any[]>('/campagnes', { statut }),
  obtenir: (id: number) => get(`/campagnes/${id}`),
  creer: (b: Q) => post('/campagnes', b),
  lancer: (id: number) => post(`/campagnes/${id}/lancer`),
  cloturer: (id: number) => post(`/campagnes/${id}/cloturer`),
  annuler: (id: number) => post(`/campagnes/${id}/annuler`),
};
export const integrationApi = {
  webhooks: () => get('/integration/webhooks'),
  creerWebhook: (b: Q) => post('/integration/webhooks', b),
  modifierWebhook: (id: number, b: Q) => put(`/integration/webhooks/${id}`, b),
  supprimerWebhook: (id: number) => del(`/integration/webhooks/${id}`),
  testerWebhook: (id: number) => post(`/integration/webhooks/${id}/test`),
  journal: (p: Q) => liste('/integration/journal-echanges', p),
};

// ── Comptabilité ────────────────────────────────────────────────────────────
export const comptaApi = {
  plan: () => get('/comptabilite/plan'),
  journal: (p: Q) => liste('/comptabilite/journal', p),
  balance: (p: Q) => get('/comptabilite/balance', p),
  grandLivre: (compte: string, p: Q) => get('/comptabilite/grand-livre', { compte, ...p }),
  etats: (p: Q) => get('/comptabilite/etats', p),
  ecriture: (b: Q) => post('/comptabilite/ecritures', b),
  annulerEcriture: (id: number, motif: string) => post(`/comptabilite/ecritures/${id}/annuler`, { motif }),
  periodes: () => get('/comptabilite/periodes'),
  cloturer: (periode: string) => post(`/comptabilite/periodes/${periode}/cloturer`),
  rouvrir: (periode: string, motif: string) => post(`/comptabilite/periodes/${periode}/rouvrir`, { motif }),
  pousser: () => post('/comptabilite/export/pousser'),
  importerReleve: (b: Q) => post('/comptabilite/releves', b),
  releves: () => get('/comptabilite/releves'),
  releve: (id: number | string) => get(`/comptabilite/releves/${id}`),
  rapprocher: (id: number) => post(`/comptabilite/releves/${id}/rapprocher`),
  lierLigne: (id: number, b: Q) => put(`/comptabilite/releves/lignes/${id}`, b),
};

// ── Conformité ──────────────────────────────────────────────────────────────
export const conformiteApi = {
  resume: () => get('/conformite/resume'),
  alertes: (p: Q) => liste('/conformite/alertes', p),
  traiter: (id: number, b: Q) => post(`/conformite/alertes/${id}/traiter`, b),
  analyser: () => post('/conformite/analyse'),
  listes: (p: Q) => liste('/conformite/listes', p),
  ajouterEntree: (b: Q) => post('/conformite/listes', b),
  supprimerEntree: (id: number) => del(`/conformite/listes/${id}`),
  importer: (csv: string) => post('/conformite/listes/import', { csv }),
  verifier: (b: Q) => post('/conformite/verification', b),
};

// ── Administration, sécurité, analytique ────────────────────────────────────
export const administrationApi = {
  parametres: () => get('/administration/parametres'),
  definir: (cle: string, valeur: unknown) => put(`/administration/parametres/${cle}`, { valeur }),
  reinitialiser: (cle: string) => del(`/administration/parametres/${cle}`),
  taches: () => get('/administration/taches'),
  executerTache: (nom: string) => post(`/administration/taches/${nom}/executer`),
};
export const securiteApi = {
  etat: () => get('/securite/etat'),
  utilisateurs: () => get('/securite/utilisateurs'),
  debloquer: (id: number) => post(`/securite/utilisateurs/${id}/debloquer`),
  reinitialiserMfa: (id: number) => post(`/securite/utilisateurs/${id}/reinitialiser-mfa`),
  sauvegardes: () => get('/securite/sauvegardes'),
  verifierSauvegardes: () => post('/securite/sauvegardes/verifier'),
  sauvegarder: () => post('/securite/sauvegardes'),
};
export const analytiqueApi = {
  credit: (p: Q) => get('/analytique/credit', p),
  recouvrement: (p: Q) => get('/analytique/recouvrement', p),
  zones: (p: Q) => get('/analytique/zones', p),
  agences: (p: Q) => get('/analytique/agences', p),
  produits: (p: Q) => get('/analytique/produits', p),
};
export const objectifsApi = {
  recalculer: () => post('/objectifs/recalculer'),
  /** Projection de tendance et cible réajustée suggérée (compléments stratégiques, point 14). */
  projection: (id: number) => get<{ jours_ecoules: number; jours_totaux: number; rythme_journalier: number; projection_fin_periode: number; ecart_projete_pct: number | null; cible_suggeree: number | null }>(`/objectifs/${id}/projection`),
};
