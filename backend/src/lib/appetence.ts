/**
 * Matrice client × produit (Lot 15, doc "Customer Value Growth" §2-3). Moteur de règles
 * déterministes et explicables, dans le même esprit que `lib/segmentation.ts` : aucun modèle
 * statistique, chaque composante du score est commentée. Recalculée à la suite de
 * `recalculerScoresClients()` (voir segmentation.ts), pour disposer des scores à jour.
 */

export type TypeOpportunite = 'cross_sell' | 'up_sell';

export interface ProduitAppetenceRef {
  id: number;
  groupeId: number;
  type: 'epargne' | 'credit' | 'autre';
  ageMin: number | null;
  ageMax: number | null;
  ancienneteActiviteMinMois: number | null;
  montantMax: number | null;
}

export interface ClientAppetenceRef {
  statut: 'actif' | 'inactif' | 'blackliste';
  dateNaissance: Date | null;
  ancienneteActiviteMois: number | null;
  cycleVie: string;
  score: number;
  montantImpaye: number;
  nombreIncidents90j: number;
  encoursCredit: number;
  produitsDetenusIds: Set<number>;
  /** Par groupe de produit détenu : le plafond (montantMax) le plus élevé parmi les produits
   * détenus de ce groupe, pour détecter une opportunité d'évolution vers un palier supérieur. */
  groupesDetenus: Map<number, { montantMaxDetenu: number | null }>;
}

export interface ResultatAppetence {
  detenu: boolean;
  eligible: boolean;
  score: number;
  typeOpportunite: TypeOpportunite | null;
  raison: string;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const AGE_ANS = (dateNaissance: Date) => Math.floor((Date.now() - dateNaissance.getTime()) / (365.25 * 24 * 3600 * 1000));

/**
 * Calcul pur, testable indépendamment de la base. Reprend les seuils d'âge/ancienneté d'activité
 * déjà posés sur `ParametrageProduit` (mêmes champs que `credit.service.ts: verifierEligibilite`,
 * sans les contraintes de montant/durée qui ne s'appliquent qu'à une demande précise).
 */
export function calculerAppetenceProduit(client: ClientAppetenceRef, produit: ProduitAppetenceRef): ResultatAppetence {
  const detenu = client.produitsDetenusIds.has(produit.id);
  if (detenu) return { detenu: true, eligible: true, score: 0, typeOpportunite: null, raison: 'Produit déjà détenu.' };

  if (client.statut !== 'actif') {
    return { detenu: false, eligible: false, score: 0, typeOpportunite: null, raison: `Client ${client.statut} : aucune proposition commerciale.` };
  }

  const motifs: string[] = [];
  if (produit.type === 'credit') {
    if (client.dateNaissance && (produit.ageMin !== null || produit.ageMax !== null)) {
      const age = AGE_ANS(client.dateNaissance);
      if (produit.ageMin !== null && age < produit.ageMin) motifs.push(`âge inférieur au minimum requis (${produit.ageMin} ans)`);
      if (produit.ageMax !== null && age > produit.ageMax) motifs.push(`âge supérieur au maximum autorisé (${produit.ageMax} ans)`);
    }
    if (produit.ancienneteActiviteMinMois !== null && (client.ancienneteActiviteMois ?? 0) < produit.ancienneteActiviteMinMois) {
      motifs.push(`ancienneté d'activité insuffisante (minimum ${produit.ancienneteActiviteMinMois} mois)`);
    }
  }
  if (motifs.length > 0) return { detenu: false, eligible: false, score: 0, typeOpportunite: null, raison: `Non éligible : ${motifs.join(', ')}.` };

  const incident = client.montantImpaye > 0 || client.nombreIncidents90j > 0;
  const groupeDetenu = client.groupesDetenus.get(produit.groupeId);

  // Up-sell (crédit uniquement : l'encours comparé est un encours de crédit) : le client détient
  // déjà un crédit de la même famille, le produit candidat a un plafond supérieur, et l'encours
  // actuel approche le plafond du produit détenu (80 %+). Les familles de produits (GroupeProduit)
  // ne sont pas des paliers formels : c'est une heuristique de ciblage, pas une règle d'octroi.
  const upSell = produit.type === 'credit' && !!groupeDetenu && groupeDetenu.montantMaxDetenu !== null && produit.montantMax !== null &&
    produit.montantMax > groupeDetenu.montantMaxDetenu && client.encoursCredit >= 0.8 * groupeDetenu.montantMaxDetenu;

  // Le potentiel commercial ne doit jamais contourner la gestion du risque : aucune proposition de
  // crédit à un client en impayé, et pas de second crédit concurrent (seule l'évolution du crédit
  // en cours vers un palier supérieur est proposée). La décision reste au circuit crédit.
  if (produit.type === 'credit') {
    if (incident) return { detenu: false, eligible: false, score: 0, typeOpportunite: null, raison: 'Non proposé : impayé ou dossier de recouvrement en cours.' };
    if (client.encoursCredit > 0 && !upSell) return { detenu: false, eligible: false, score: 0, typeOpportunite: null, raison: 'Non proposé : un crédit est déjà en cours.' };
  }

  // Base 40 : éligible, sans signal particulier. Bonus/malus explicites ci-dessous.
  let score = 40;
  const signaux: string[] = [];
  if (groupeDetenu) { score += 20; signaux.push('détient déjà un produit de cette famille'); }
  if (client.cycleVie === 'actif' || client.cycleVie === 'premium') { score += 15; signaux.push('client actif'); }
  if (client.score >= 70) { score += 15; signaux.push('bon score client'); }
  if (incident) { score -= 20; signaux.push('incident récent (pénalité)'); }
  score = Math.round(clamp(score, 0, 100));

  const typeOpportunite: TypeOpportunite = upSell ? 'up_sell' : 'cross_sell';

  const raison = typeOpportunite === 'up_sell'
    ? `Palier supérieur disponible, encours proche du plafond actuel (${signaux.join(', ')}).`
    : `Opportunité de vente complémentaire (${signaux.join(', ') || 'profil éligible'}).`;

  return { detenu: false, eligible: true, score, typeOpportunite, raison };
}
