import type { DemandeCreditPayload } from '@/types/credit';

// Stock en mémoire partagé — les deux pages (liste + formulaire) voient les mêmes données
export const mockCreditsStore = [
  { id: 1, ref: 'CR-2024-001', client: 'Zambo Paul', clientId: '1', montant: 1500000, statut: 'decaisse', type: 'Individuel', produit: 'Crédit Consommation', duree: 12, frequence: 'mensuel', objet: 'Achat de matériel agricole', garantieType: 'salaire', garantieValeur: 3000000, date: '2024-05-10', agence: 'Akwa', agent: 'Mvondo Jean' },
  { id: 2, ref: 'CR-2024-002', client: "Eto'o Samuel", clientId: '3', montant: 25000000, statut: 'en_cours', type: 'PME', produit: 'Crédit PME', duree: 36, frequence: 'mensuel', objet: 'Extension de la boutique principale', garantieType: 'immobilier', garantieValeur: 40000000, date: '2024-05-12', agence: 'Akwa', agent: 'Kamga Eric' },
  { id: 3, ref: 'CR-2024-003', client: 'Moukoko Hélène', clientId: '2', montant: 500000, statut: 'en_attente', type: 'Individuel', produit: 'Crédit Consommation', duree: 6, frequence: 'mensuel', objet: 'Fonds de roulement commerce', garantieType: 'tiers_garant', garantieValeur: 800000, date: '2024-05-15', agence: 'Bonanjo', agent: 'Talla Pierre' },
  { id: 4, ref: 'CR-2024-004', client: 'Ngando Pierre', clientId: '4', montant: 2000000, statut: 'rejete', type: 'Individuel', produit: 'Crédit Agricole', duree: 12, frequence: 'mensuel', objet: 'Achat semences et engrais', garantieType: 'materiel', garantieValeur: 1500000, date: '2024-05-01', agence: 'Bassa', agent: 'Mvondo Jean' },
  { id: 5, ref: 'CR-2024-005', client: 'Association Femmes Solidaires', clientId: '5', montant: 5000000, statut: 'en_analyse', type: 'Solidaire', produit: 'Crédit Solidaire', duree: 18, frequence: 'mensuel', objet: 'Activités génératrices de revenus — groupe de 12 membres', garantieType: 'tiers_garant', garantieValeur: 6000000, date: '2024-05-14', agence: 'Akwa', agent: 'Ngassa Marie' },
];

let refCounter = 6;

export const creditService = {
  getCredits: async () => {
    await new Promise((r) => setTimeout(r, 300));
    return { data: [...mockCreditsStore] };
  },

  getCredit: async (id: number | string) => {
    await new Promise((r) => setTimeout(r, 200));
    const credit = mockCreditsStore.find((c) => c.id === Number(id));
    if (!credit) throw new Error('Crédit non trouvé');
    return { data: credit };
  },

  createDemande: async (payload: DemandeCreditPayload & { clientNom?: string }) => {
    await new Promise((r) => setTimeout(r, 800));
    const year = new Date().getFullYear();
    const ref = `CR-${year}-${String(refCounter++).padStart(3, '0')}`;
    const newCredit = {
      id: Date.now(),
      ref,
      client: payload.clientNom || `Client #${payload.client_id}`,
      clientId: String(payload.client_id),
      montant: Number(payload.montant_demande),
      statut: 'en_attente',
      type: payload.type_credit === 'individuel' ? 'Individuel'
           : payload.type_credit === 'solidaire' ? 'Solidaire'
           : payload.type_credit === 'pme' ? 'PME'
           : 'Agricole',
      produit: payload.produit_id ? `Produit #${payload.produit_id}` : 'Crédit Standard',
      duree: Number(payload.duree_mois),
      frequence: payload.frequence_remboursement || 'mensuel',
      objet: payload.objet_financement || '',
      garantieType: payload.garantie_principale || '',
      garantieValeur: Number(payload.valeur_garantie) || 0,
      date: new Date().toISOString().split('T')[0],
      agence: 'Douala Akwa',
      agent: 'Agent connecté',
    };
    mockCreditsStore.unshift(newCredit);
    return { data: newCredit };
  },
};
