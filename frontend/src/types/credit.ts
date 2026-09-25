export type StatutDemandeCredit =
  | 'brouillon' | 'soumise' | 'kyc_en_cours' | 'kyc_valide' | 'analyse_en_cours'
  | 'analyse_terminee' | 'comite_en_attente' | 'approuvee' | 'rejetee'
  | 'contrat_edite' | 'decaissee' | 'cloturee' | 'annulee';

export type Periodicite = 'mensuel' | 'bimensuel' | 'trimestriel' | 'semestriel';
export type TypeCredit = 'individuel' | 'solidaire' | 'pme' | 'agricole';
export type HypotheseRetenue = 'haute' | 'basse' | 'moyenne';
export type TypeGarantie = 'salaire' | 'immobilier' | 'materiel' | 'nantissement' | 'depot_garantie' | 'tiers_garant' | 'autre';
export type ModeReglement = 'especes' | 'virement' | 'compte' | 'cheque';

export interface PersonneRef { id: number; prenom: string; nom: string }

export interface DemandeCreditListe {
  id: number;
  reference: string;
  statut: StatutDemandeCredit;
  typeCredit: TypeCredit;
  montantDemande: string;
  montantAccorde: string | null;
  dureeMois: number;
  createdAt: string;
  scoreValeur: number | null;
  scoreClasse: string | null;
  client: { id: number; nom: string; prenom: string | null; typePersonne: string };
  produit: { id: number; nom: string };
  agence: { id: number; nom: string };
  montePar: PersonneRef;
}

export interface Garantie { id: number; type: TypeGarantie; description: string; valeurEstimee: string; valeurRetenue: string | null; reference: string | null }
export interface Garant { id: number; nom: string; prenom: string | null; telephone: string; lienParente: string | null; profession: string | null; revenuMensuel: string | null }

export interface Echeance {
  id: number; numero: number; dateEcheance: string; capital: string; interet: string; frais: string; penalite: string;
  montantTotal: string; capitalRestantDu: string; montantPaye: string;
  statut: 'a_echoir' | 'payee' | 'partiellement_payee' | 'en_retard' | 'impayee';
}

export interface ActeWorkflow { id: number; etape: string; commentaire: string | null; createdAt: string; acteur: PersonneRef }

export interface DemandeCreditDetail extends Omit<DemandeCreditListe, 'client' | 'produit' | 'agence'> {
  client: Record<string, unknown> & { id: number; nom: string; prenom: string | null };
  produit: { id: number; nom: string; type: string };
  agence: { id: number; nom: string };
  periodicite: Periodicite;
  differeMois: number;
  objet: string;
  tauxApplique: string | null;
  dureeAccordeeMois: number | null;
  motifDecision: string | null;
  dossierKyc: { id: number; reference: string; statut: string; niveauRisque: string | null } | null;
  analysePar: PersonneRef | null;
  decidePar: PersonneRef | null;
  garanties: Garantie[];
  garants: Garant[];
  visites: { id: number; dateVisite: string; compteRendu: string; visitePar: PersonneRef; photos: { id: number; url: string; nomFichier: string }[] }[];
  decisions: { id: number; sens: string; instance: string; motif: string | null; conditions: string | null; createdAt: string; decidePar: PersonneRef; montantAccorde: string | null }[];
  contrat: { id: number; numero: string; montant: string; taux: string; dureeMois: number; fraisDossier: string; signeParClient: boolean; dateSignature: string | null; dateDeblocage: string | null } | null;
  echeances: Echeance[];
  avenants: { id: number; type: string; motif: string; ancienMontant: string; nouveauMontant: string; dateEffet: string }[];
  actes: ActeWorkflow[];
  instance_requise: 'agence' | 'comite' | 'direction';
}

export interface LigneSimulation { numero: number; dateEcheance: string; capital: number; interet: number; montantTotal: number; capitalRestantDu: number }
export interface Simulation {
  taux_annuel: number; mode_amortissement: string; frais_dossier: number; eligible: boolean; motifs_ineligibilite: string[];
  lignes: LigneSimulation[]; totalInterets: number; totalARembourser: number; premiereEcheance: number; coutTotal: number; teg: number;
}

export interface PayloadDemande {
  client_id: number; produit_id: number; type_credit: TypeCredit; montant_demande: number; duree_mois: number;
  periodicite: Periodicite; differe_mois?: number; objet: string; latitude?: number | null; longitude?: number | null;
}

/** Corps de la grille d'analyse : identique à celui attendu par l'API. */
export interface GrilleForm {
  moisAnnee: string;
  caHypotheseHaute: number; caHypotheseBasse: number; hypotheseRetenue: HypotheseRetenue; caCommentaire: string;
  achatsMarchandises: number; transportApprovisionnement: number;
  loyerLocal: number; impotsTaxes: number; salaires: number; eauElectricite: number; reparationsMaintenance: number; autresDepensesActivite: number;
  loyerDomicile: number; autresDepensesFamiliales: number;
  echeancesCecaw: number; echeancesAutresEmf: number; detteAutresEmf: number; autresRevenusNets: number;
  detailCalculs: string;
  bilan: {
    localTerrain: number; equipement: number; stockMarchandises: number; creancesClients: number; liquidites: number; autresActifs: number;
    dettes: number; actifCommentaire: string; passifCommentaire: string;
  };
}

export interface ResultatGrille {
  caRetenu: number; margeBrute: number; tauxMarge: number; chargesFixes: number; totalDepenses: number; cashFlow: number;
  totalHorsActivite: number; echeancesEnCours: number; capaciteRemboursement: number;
  tauxCouverture: number | null; ratioEndettement: number | null; alertes: string[];
}
export interface ResultatBilan { totalFondsCommerce: number; dettes: number; fondsPropres: number; totalPassif: number; alertes: string[] }

export const STATUT_LABELS: Record<StatutDemandeCredit, string> = {
  brouillon: 'Brouillon', soumise: 'Soumise', kyc_en_cours: 'KYC en cours', kyc_valide: 'KYC validé',
  analyse_en_cours: "En cours d'analyse", analyse_terminee: 'Analyse terminée', comite_en_attente: 'En attente de décision',
  approuvee: 'Approuvée', rejetee: 'Rejetée', contrat_edite: 'Contrat édité', decaissee: 'Décaissée', cloturee: 'Clôturée', annulee: 'Annulée',
};

export const STATUT_VARIANT: Record<StatutDemandeCredit, 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' | 'outline'> = {
  brouillon: 'outline', soumise: 'secondary', kyc_en_cours: 'warning', kyc_valide: 'info', analyse_en_cours: 'info',
  analyse_terminee: 'info', comite_en_attente: 'warning', approuvee: 'success', rejetee: 'destructive',
  contrat_edite: 'info', decaissee: 'success', cloturee: 'secondary', annulee: 'outline',
};
