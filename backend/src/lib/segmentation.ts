import prisma from './prisma';
import { parametreNombre } from './parametres';
import { calculerAppetenceProduit, type ClientAppetenceRef, type ProduitAppetenceRef } from './appetence';

/**
 * Segmentation et score client (compléments stratégiques, point 1 ; étendu Lot 15 avec les 7
 * familles de score du moteur de segmentation et la matrice client × produit). Moteur de règles
 * déterministes, explicables et traçables : aucun modèle statistique ni appel à un service
 * externe. Recalculé chaque nuit par la tâche planifiée `score_clients` (voir planificateur.ts),
 * et à la demande via POST /clients/scores/recalculer.
 */

export type CycleVie = 'nouveau' | 'actif' | 'dormant' | 'a_risque' | 'premium';
export type CycleVieEtendu = CycleVie | 'perdu' | 'a_reactiver';

export interface DonneesScore {
  ancienneteMois: number;
  encoursCredit: number;
  soldeEpargne: number;
  montantImpaye: number;
  dossierRecouvrementOuvert: boolean;
  joursDepuisDernierContact: number | null;
  joursDepuisDerniereTransaction: number | null;
}

export interface ResultatScore {
  score: number;
  potentiel: number;
  cycleVie: CycleVie;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Jours sans contact ; jamais contacté = depuis l'entrée en relation (sinon un client jamais suivi
 *  ne pourrait jamais être classé dormant, alors qu'une absence de transaction l'est déjà). */
const joursSansContact = (d: DonneesScore) => d.joursDepuisDernierContact ?? d.ancienneteMois * 30;

/**
 * Calcul pur, testable indépendamment de la base. Chaque composante est documentée pour rester
 * explicable : un score jamais issu d'une boîte noire. Signature inchangée depuis les
 * compléments stratégiques (point 1) : les familles « Score client » et « Score commercial »
 * restent la source de vérité, étendues sans y toucher par `calculerScoresEtendus` ci-dessous.
 */
export function calculerScoreClient(d: DonneesScore, seuilDormantJours: number, seuilPremium: number): ResultatScore {
  let score = 50;
  // Ancienneté : jusqu'à 20 points, un point tous les 3 mois de relation.
  score += clamp(d.ancienneteMois / 3, 0, 20);
  // Encours crédit sain (aucun impayé) : bonus de confiance. Impayé : pénalité forte.
  if (d.montantImpaye > 0) score -= 30;
  else if (d.encoursCredit > 0) score += 15;
  // Épargne constituée : signal de stabilité financière.
  if (d.soldeEpargne >= 500_000) score += 15;
  else if (d.soldeEpargne > 0) score += 8;
  // Contact récent : signal d'engagement actif.
  if (d.joursDepuisDernierContact !== null && d.joursDepuisDernierContact <= 30) score += 5;
  score = Math.round(clamp(score, 0, 100));

  // Potentiel (opportunité commerciale) : épargne disponible, pas encore de crédit, ancienneté
  // suffisante pour être sollicité, dossier propre. Sert à cibler les relances d'opportunité
  // (Lot 11) plutôt que les relances de recouvrement.
  let potentiel = 0;
  if (d.soldeEpargne > 0) potentiel += 30;
  if (d.encoursCredit === 0 && d.ancienneteMois >= 6) potentiel += 40;
  if (d.montantImpaye === 0) potentiel += 30;
  potentiel = Math.round(clamp(potentiel, 0, 100));

  let cycleVie: CycleVie;
  if (d.dossierRecouvrementOuvert) {
    cycleVie = 'a_risque';
  } else if (
    joursSansContact(d) > seuilDormantJours &&
    (d.joursDepuisDerniereTransaction === null || d.joursDepuisDerniereTransaction > seuilDormantJours)
  ) {
    cycleVie = 'dormant';
  } else if (d.ancienneteMois < 3) {
    cycleVie = 'nouveau';
  } else if (score >= seuilPremium) {
    cycleVie = 'premium';
  } else {
    cycleVie = 'actif';
  }

  return { score, potentiel, cycleVie };
}

/**
 * Ajoute les deux branches absentes du moteur de base (doc segmentation §8, chaîne de cycle de vie) :
 * - `perdu` : dormant depuis bien plus longtemps que le seuil dormant, encours nul ;
 * - `a_reactiver` : client qui était dormant/perdu au calcul précédent et vient d'être recontacté.
 *   Un contact récent sort justement le client du statut dormant dans le moteur de base : la
 *   réactivation se lit donc sur le cycle antérieur, pas sur le cycle de base courant. Elle reste
 *   affichée pendant `seuilReactivationJours`, puis le client retombe sur son cycle normal.
 * Un dossier de recouvrement ouvert (`a_risque`) prime toujours.
 */
export function affinerCycleVie(
  base: ResultatScore, d: DonneesScore, cycleVieAnterieur: CycleVieEtendu | null,
  seuilPerduJours: number, seuilReactivationJours: number,
): CycleVieEtendu {
  if (base.cycleVie === 'dormant') {
    const joursTx = d.joursDepuisDerniereTransaction;
    const tresLongtempsInactif = joursSansContact(d) > seuilPerduJours && (joursTx === null || joursTx > seuilPerduJours);
    return tresLongtempsInactif && d.encoursCredit === 0 ? 'perdu' : 'dormant';
  }
  const etaitInactif = cycleVieAnterieur === 'dormant' || cycleVieAnterieur === 'perdu' || cycleVieAnterieur === 'a_reactiver';
  const contactRecent = d.joursDepuisDernierContact !== null && d.joursDepuisDernierContact <= seuilReactivationJours;
  if (base.cycleVie !== 'a_risque' && etaitInactif && contactRecent) return 'a_reactiver';
  return base.cycleVie;
}

export interface ResultatScoreEtendu extends Omit<ResultatScore, 'cycleVie'> {
  cycleVie: CycleVieEtendu;
  /** Famille D — Score crédit (profil de financement). */
  scoreCredit: number;
  /** Famille E — Score risque (niveau d'exposition, 100 = sain). */
  scoreRisque: number;
  /** Famille F — Score relationnel (qualité de la relation). */
  scoreRelationnel: number;
  /** Famille G — Score stratégique (valeur stratégique long terme). */
  scoreStrategique: number;
  /** Customer Growth Score : potentiel d'augmentation de la valeur client. */
  scoreCroissance: number;
  /** Score d'attrition continu 0-100 (plus haut = plus de risque de désengagement). */
  scoreAttrition: number;
  nombreProduits: number;
  panierMoyen: number;
}

export interface FaitsScoreEtendu {
  nombreIncidents90j: number;
  nombreInteractions90j: number;
  derniereDemandeScoreValeur: number | null;
  nombreProduitsDistincts: number;
  cycleVieAnterieur: CycleVieEtendu | null;
}

/**
 * Dérive les 5 familles de score additionnelles et les 2 métriques de portefeuille, à partir du
 * résultat de base et de faits complémentaires. Règles explicites, pondérations documentées
 * ligne à ligne — pas de modèle statistique.
 */
export function calculerScoresEtendus(
  d: DonneesScore, f: FaitsScoreEtendu,
  seuilDormantJours: number, seuilPremium: number, seuilPerduJours: number, seuilReactivationJours: number,
): ResultatScoreEtendu {
  const base = calculerScoreClient(d, seuilDormantJours, seuilPremium);
  const cycleVie = affinerCycleVie(base, d, f.cycleVieAnterieur, seuilPerduJours, seuilReactivationJours);
  const panierMoyen = d.encoursCredit + d.soldeEpargne;

  // Score crédit : score de la dernière demande analysée si connu (grille d'analyse A/B/C/D),
  // sinon une estimation simplifiée à partir des mêmes signaux que le score client, pondérés
  // pour la capacité de financement plutôt que la valeur globale.
  const scoreCredit = f.derniereDemandeScoreValeur ?? Math.round(clamp(
    30 + clamp(d.ancienneteMois / 2, 0, 30) + (d.montantImpaye === 0 ? 25 : -10) + (d.soldeEpargne > 0 ? 15 : 0),
    0, 100,
  ));

  // Score risque : part de 100 (sain), pénalités sur dossier ouvert, nombre d'incidents récents,
  // et endettement sans épargne de contrepartie.
  let scoreRisque = 100;
  if (d.dossierRecouvrementOuvert) scoreRisque -= 35;
  scoreRisque -= clamp(f.nombreIncidents90j * 10, 0, 30);
  if (d.encoursCredit > 0 && d.soldeEpargne === 0) scoreRisque -= 10;
  scoreRisque = Math.round(clamp(scoreRisque, 0, 100));

  // Score relationnel : fréquence des interactions récentes, contact récent, ancienneté.
  let scoreRelationnel = 30;
  scoreRelationnel += clamp(f.nombreInteractions90j * 8, 0, 40);
  if (d.joursDepuisDernierContact !== null && d.joursDepuisDernierContact <= 30) scoreRelationnel += 15;
  scoreRelationnel += clamp(d.ancienneteMois / 6, 0, 15);
  scoreRelationnel = Math.round(clamp(scoreRelationnel, 0, 100));

  // Score stratégique : composite pondéré valeur (40%) + potentiel (30%) + poids du portefeuille (30%).
  const scoreStrategique = Math.round(clamp(base.score * 0.4 + base.potentiel * 0.3 + clamp(panierMoyen / 20_000, 0, 30), 0, 100));

  // Score d'attrition : version continue du signal « dormant », pour détecter la tendance avant
  // le basculement catégoriel.
  let scoreAttrition = 0;
  scoreAttrition += clamp((joursSansContact(d) / seuilDormantJours) * 50, 0, 50);
  if (d.joursDepuisDerniereTransaction !== null) scoreAttrition += clamp((d.joursDepuisDerniereTransaction / seuilDormantJours) * 30, 0, 30);
  if (f.nombreInteractions90j === 0) scoreAttrition += 20;
  scoreAttrition = Math.round(clamp(scoreAttrition, 0, 100));

  // Customer Growth Score : marge de progression du taux d'équipement (jusqu'à 5 produits de
  // référence), pondérée par le potentiel commercial et la maîtrise du risque.
  const margeEquipement = clamp((5 - f.nombreProduitsDistincts) * 15, 0, 60);
  const scoreCroissance = Math.round(clamp(margeEquipement + base.potentiel * 0.3 + (scoreRisque >= 70 ? 10 : 0), 0, 100));

  return {
    ...base, cycleVie, scoreCredit, scoreRisque, scoreRelationnel, scoreStrategique, scoreCroissance, scoreAttrition,
    nombreProduits: f.nombreProduitsDistincts, panierMoyen,
  };
}

/** Recalcule et réécrit le score (7 familles) de tous les clients, puis leurs appétences produit.
 *  Retourne un décompt par cycle de vie. */
export async function recalculerScoresClients(): Promise<{ traites: number; par_cycle: Record<string, number> }> {
  const seuilDormantJours = await parametreNombre('segmentation.dormant_jours_contact');
  const seuilPremium = await parametreNombre('segmentation.premium_score_min');
  const seuilPerduJours = await parametreNombre('segmentation.perdu_jours_sans_activite');
  const seuilReactivationJours = await parametreNombre('segmentation.reactivation_jours_recents');
  const maintenant = Date.now();
  const jours = (date: Date | null | undefined) => (date ? Math.floor((maintenant - date.getTime()) / 86_400_000) : null);
  const quatreVingtDixJours = new Date(maintenant - 90 * 86_400_000);

  const clients = await prisma.client.findMany({
    select: {
      id: true, createdAt: true, statut: true, dateNaissance: true, ancienneteActiviteMois: true,
      score: { select: { cycleVie: true } },
      comptes: { where: { statut: { not: 'clos' } }, select: { id: true, solde: true, produitId: true, produit: { select: { type: true, groupeId: true } } } },
      demandesCredit: {
        where: { statut: 'decaissee' },
        select: { produitId: true, produit: { select: { groupeId: true } }, echeances: { select: { statut: true, montantTotal: true, montantPaye: true } } },
      },
      dossiersRecouvrement: { where: { statut: { notIn: ['regularise', 'irrecouvrable'] } }, select: { id: true, montantImpaye: true } },
      interactions: { select: { dateInteraction: true }, orderBy: { dateInteraction: 'desc' } },
      visitesTournee: { where: { statut: 'realisee' }, select: { arriveeAt: true }, orderBy: { arriveeAt: 'desc' }, take: 1 },
    },
  });

  // Dernière transaction par compte, agrégée par client : une requête groupée plutôt qu'une par client.
  const dernieresTransactions = await prisma.transaction.groupBy({ by: ['compteId'], _max: { createdAt: true } });
  const derniereTxParCompte = new Map(dernieresTransactions.map((t) => [t.compteId, t._max.createdAt] as const));

  // Dernier score de grille d'analyse connu par client, toutes demandes confondues, le plus récent
  // en premier : une requête groupée plutôt qu'une par client.
  const demandesAvecScore = await prisma.demandeCredit.findMany({
    where: { scoreValeur: { not: null } }, orderBy: { createdAt: 'desc' }, select: { clientId: true, scoreValeur: true },
  });
  const derniereDemandeScoreParClient = new Map<number, number>();
  for (const demande of demandesAvecScore) {
    if (!derniereDemandeScoreParClient.has(demande.clientId)) derniereDemandeScoreParClient.set(demande.clientId, demande.scoreValeur!);
  }

  const parCycle: Record<string, number> = {};
  const ecritures: {
    clientId: number;
    data: ResultatScoreEtendu & { encoursCredit: number; soldeEpargne: number; ancienneteMois: number; joursDepuisDernierContact: number | null; joursDepuisDerniereTransaction: number | null };
    appetenceRef: ClientAppetenceRef;
  }[] = [];

  for (const c of clients) {
    const ancienneteMois = Math.max(0, Math.floor((maintenant - c.createdAt.getTime()) / (30 * 86_400_000)));
    const soldeEpargne = c.comptes.filter((cc) => cc.produit.type === 'epargne').reduce((s, cc) => s + Number(cc.solde), 0);
    const encoursCredit = c.demandesCredit.flatMap((d) => d.echeances).filter((e) => e.statut !== 'payee').reduce((s, e) => s + Math.max(0, Number(e.montantTotal) - Number(e.montantPaye)), 0);
    const montantImpaye = c.dossiersRecouvrement.reduce((s, d) => s + Number(d.montantImpaye), 0);
    const dernierContact = c.interactions[0]?.dateInteraction ?? c.visitesTournee[0]?.arriveeAt ?? null;
    const derniereTransaction = c.comptes.reduce<Date | null>((plusRecente, cc) => {
      const d = derniereTxParCompte.get(cc.id);
      if (!d) return plusRecente;
      return !plusRecente || d > plusRecente ? d : plusRecente;
    }, null);
    const joursDepuisDernierContact = jours(dernierContact);
    const joursDepuisDerniereTransaction = jours(derniereTransaction);
    const nombreIncidents90j = c.dossiersRecouvrement.length;
    const nombreInteractions90j = c.interactions.filter((i) => i.dateInteraction >= quatreVingtDixJours).length;

    const donnees: DonneesScore = { ancienneteMois, encoursCredit, soldeEpargne, montantImpaye, dossierRecouvrementOuvert: c.dossiersRecouvrement.length > 0, joursDepuisDernierContact, joursDepuisDerniereTransaction };

    // Produits distincts détenus (comptes ouverts + crédits décaissés) et, par famille de produit,
    // le plafond le plus élevé détenu — pour la matrice d'appétence calculée plus bas.
    const produitsDetenusIds = new Set<number>();
    const groupesDetenus = new Map<number, { montantMaxDetenu: number | null }>();
    for (const cc of c.comptes) produitsDetenusIds.add(cc.produitId);
    for (const dc of c.demandesCredit) produitsDetenusIds.add(dc.produitId);

    const resultat = calculerScoresEtendus(
      donnees,
      { nombreIncidents90j, nombreInteractions90j, derniereDemandeScoreValeur: derniereDemandeScoreParClient.get(c.id) ?? null, nombreProduitsDistincts: produitsDetenusIds.size, cycleVieAnterieur: c.score?.cycleVie ?? null },
      seuilDormantJours, seuilPremium, seuilPerduJours, seuilReactivationJours,
    );
    parCycle[resultat.cycleVie] = (parCycle[resultat.cycleVie] ?? 0) + 1;

    ecritures.push({
      clientId: c.id,
      data: { ...resultat, encoursCredit, soldeEpargne, ancienneteMois, joursDepuisDernierContact, joursDepuisDerniereTransaction },
      appetenceRef: {
        statut: c.statut, dateNaissance: c.dateNaissance, ancienneteActiviteMois: c.ancienneteActiviteMois,
        cycleVie: resultat.cycleVie, score: resultat.score, montantImpaye, nombreIncidents90j, encoursCredit,
        produitsDetenusIds, groupesDetenus,
      },
    });
  }

  for (let i = 0; i < ecritures.length; i += 500) await prisma.$transaction(
    ecritures.slice(i, i + 500).map((e) => prisma.scoreClient.upsert({
      where: { clientId: e.clientId },
      create: {
        clientId: e.clientId, score: e.data.score, potentiel: e.data.potentiel, cycleVie: e.data.cycleVie as never,
        scoreCredit: e.data.scoreCredit, scoreRisque: e.data.scoreRisque, scoreRelationnel: e.data.scoreRelationnel,
        scoreStrategique: e.data.scoreStrategique, scoreCroissance: e.data.scoreCroissance, scoreAttrition: e.data.scoreAttrition,
        nombreProduits: e.data.nombreProduits, panierMoyen: e.data.panierMoyen,
        encoursCredit: e.data.encoursCredit, soldeEpargne: e.data.soldeEpargne, ancienneteMois: e.data.ancienneteMois,
        joursDepuisDernierContact: e.data.joursDepuisDernierContact, joursDepuisDerniereTransaction: e.data.joursDepuisDerniereTransaction,
      },
      update: {
        score: e.data.score, potentiel: e.data.potentiel, cycleVie: e.data.cycleVie as never,
        scoreCredit: e.data.scoreCredit, scoreRisque: e.data.scoreRisque, scoreRelationnel: e.data.scoreRelationnel,
        scoreStrategique: e.data.scoreStrategique, scoreCroissance: e.data.scoreCroissance, scoreAttrition: e.data.scoreAttrition,
        nombreProduits: e.data.nombreProduits, panierMoyen: e.data.panierMoyen,
        encoursCredit: e.data.encoursCredit, soldeEpargne: e.data.soldeEpargne, ancienneteMois: e.data.ancienneteMois,
        joursDepuisDernierContact: e.data.joursDepuisDernierContact, joursDepuisDerniereTransaction: e.data.joursDepuisDerniereTransaction, calculeAt: new Date(),
      },
    })),
  );

  await recalculerAppetencesClients(new Map(ecritures.map((e) => [e.clientId, e.appetenceRef])));

  return { traites: ecritures.length, par_cycle: parCycle };
}

/**
 * Recalcule la matrice client × produit pour les clients donnés (appelé par
 * `recalculerScoresClients()` juste après la mise à jour des scores, pour disposer de
 * `cycleVie`/`score` à jour). Les plafonds des produits détenus (`groupesDetenus`) sont renseignés
 * ici, une fois le référentiel produits chargé — ils ne sont pas connus au moment du premier passage
 * client par client ci-dessus.
 */
export async function recalculerAppetencesClients(clients: Map<number, ClientAppetenceRef>): Promise<number> {
  const maintenant = new Date();
  const produitsActifs = await prisma.produit.findMany({ where: { actif: true }, select: { id: true, groupeId: true, type: true } });
  const parametragesEnVigueur = await prisma.parametrageProduit.findMany({
    where: { produitId: { in: produitsActifs.map((p) => p.id) }, dateEffet: { lte: maintenant }, OR: [{ dateFin: null }, { dateFin: { gte: maintenant } }] },
    orderBy: { dateEffet: 'desc' },
    select: { produitId: true, ageMin: true, ageMax: true, ancienneteActiviteMinMois: true, montantMax: true },
  });
  const parametrageParProduit = new Map<number, { ageMin: number | null; ageMax: number | null; ancienneteActiviteMinMois: number | null; montantMax: number | null }>();
  for (const p of parametragesEnVigueur) {
    if (!parametrageParProduit.has(p.produitId)) {
      parametrageParProduit.set(p.produitId, { ageMin: p.ageMin, ageMax: p.ageMax, ancienneteActiviteMinMois: p.ancienneteActiviteMinMois, montantMax: p.montantMax !== null ? Number(p.montantMax) : null });
    }
  }

  const produits: ProduitAppetenceRef[] = produitsActifs.map((p) => {
    const param = parametrageParProduit.get(p.id);
    return { id: p.id, groupeId: p.groupeId, type: p.type, ageMin: param?.ageMin ?? null, ageMax: param?.ageMax ?? null, ancienneteActiviteMinMois: param?.ancienneteActiviteMinMois ?? null, montantMax: param ? Number(param.montantMax) : null };
  });
  const montantMaxParProduit = new Map(produits.map((p) => [p.id, p.montantMax] as const));

  // Plafond le plus élevé détenu, par groupe, pour chaque client : dérivé des produits détenus,
  // maintenant que le référentiel produits (avec leurs plafonds) est chargé.
  for (const ref of clients.values()) {
    for (const produitId of ref.produitsDetenusIds) {
      const produit = produits.find((p) => p.id === produitId);
      if (!produit) continue;
      const montantMax = montantMaxParProduit.get(produitId) ?? null;
      const existant = ref.groupesDetenus.get(produit.groupeId);
      if (!existant || (montantMax !== null && (existant.montantMaxDetenu === null || montantMax > existant.montantMaxDetenu))) {
        ref.groupesDetenus.set(produit.groupeId, { montantMaxDetenu: montantMax });
      }
    }
  }

  const ecritures: { clientId: number; produitId: number; data: ReturnType<typeof calculerAppetenceProduit> }[] = [];
  for (const [clientId, ref] of clients) {
    for (const produit of produits) ecritures.push({ clientId, produitId: produit.id, data: calculerAppetenceProduit(ref, produit) });
  }

  // Un produit désactivé ne doit plus apparaître comme opportunité.
  await prisma.appetenceProduit.deleteMany({ where: { produitId: { notIn: produitsActifs.map((p) => p.id) } } });

  // Par lots : la matrice compte clients × produits lignes, trop pour une seule transaction.
  const TAILLE_LOT = 500;
  for (let i = 0; i < ecritures.length; i += TAILLE_LOT) {
    await prisma.$transaction(
      ecritures.slice(i, i + TAILLE_LOT).map((e) => prisma.appetenceProduit.upsert({
        where: { clientId_produitId: { clientId: e.clientId, produitId: e.produitId } },
        create: { clientId: e.clientId, produitId: e.produitId, detenu: e.data.detenu, eligible: e.data.eligible, score: e.data.score, typeOpportunite: e.data.typeOpportunite as never, raison: e.data.raison },
        update: { detenu: e.data.detenu, eligible: e.data.eligible, score: e.data.score, typeOpportunite: e.data.typeOpportunite as never, raison: e.data.raison, calculeAt: new Date() },
      })),
    );
  }

  return ecritures.length;
}
