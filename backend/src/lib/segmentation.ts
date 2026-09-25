import prisma from './prisma';
import { parametreNombre } from './parametres';

/**
 * Segmentation et score client (compléments stratégiques, point 1). Moteur de règles
 * déterministes, explicables et traçables : aucun modèle statistique ni appel à un service
 * externe. Recalculé chaque nuit par la tâche planifiée `score_clients` (voir planificateur.ts),
 * et à la demande via POST /clients/scores/recalculer.
 */

export type CycleVie = 'nouveau' | 'actif' | 'dormant' | 'a_risque' | 'premium';

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

/**
 * Calcul pur, testable indépendamment de la base. Chaque composante est documentée pour rester
 * explicable : un score jamais issu d'une boîte noire.
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
    d.joursDepuisDernierContact !== null && d.joursDepuisDernierContact > seuilDormantJours &&
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

/** Recalcule et réécrit le score de tous les clients. Retourne un décompte par cycle de vie. */
export async function recalculerScoresClients(): Promise<{ traites: number; par_cycle: Record<string, number> }> {
  const seuilDormantJours = await parametreNombre('segmentation.dormant_jours_contact');
  const seuilPremium = await parametreNombre('segmentation.premium_score_min');
  const maintenant = Date.now();
  const jours = (date: Date | null | undefined) => (date ? Math.floor((maintenant - date.getTime()) / 86_400_000) : null);

  const clients = await prisma.client.findMany({
    select: {
      id: true, createdAt: true,
      comptes: { select: { id: true, solde: true, produit: { select: { type: true } } } },
      demandesCredit: { where: { statut: 'decaissee' }, select: { echeances: { select: { statut: true, montantTotal: true, montantPaye: true } } } },
      dossiersRecouvrement: { where: { statut: { notIn: ['regularise', 'irrecouvrable'] } }, select: { id: true, montantImpaye: true } },
      interactions: { select: { dateInteraction: true }, orderBy: { dateInteraction: 'desc' }, take: 1 },
      visitesTournee: { where: { statut: 'realisee' }, select: { arriveeAt: true }, orderBy: { arriveeAt: 'desc' }, take: 1 },
    },
  });

  // Dernière transaction par compte, agrégée par client : une requête groupée plutôt qu'une par client.
  const dernieresTransactions = await prisma.transaction.groupBy({ by: ['compteId'], _max: { createdAt: true } });
  const derniereTxParCompte = new Map(dernieresTransactions.map((t) => [t.compteId, t._max.createdAt] as const));

  const parCycle: Record<string, number> = {};
  const ecritures: { clientId: number; data: ResultatScore & { encoursCredit: number; soldeEpargne: number; ancienneteMois: number; joursDepuisDernierContact: number | null; joursDepuisDerniereTransaction: number | null } }[] = [];

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

    const resultat = calculerScoreClient(
      { ancienneteMois, encoursCredit, soldeEpargne, montantImpaye, dossierRecouvrementOuvert: c.dossiersRecouvrement.length > 0, joursDepuisDernierContact, joursDepuisDerniereTransaction },
      seuilDormantJours, seuilPremium,
    );
    parCycle[resultat.cycleVie] = (parCycle[resultat.cycleVie] ?? 0) + 1;
    ecritures.push({ clientId: c.id, data: { ...resultat, encoursCredit, soldeEpargne, ancienneteMois, joursDepuisDernierContact, joursDepuisDerniereTransaction } });
  }

  await prisma.$transaction(
    ecritures.map((e) => prisma.scoreClient.upsert({
      where: { clientId: e.clientId },
      create: {
        clientId: e.clientId, score: e.data.score, potentiel: e.data.potentiel, cycleVie: e.data.cycleVie as never,
        encoursCredit: e.data.encoursCredit, soldeEpargne: e.data.soldeEpargne, ancienneteMois: e.data.ancienneteMois,
        joursDepuisDernierContact: e.data.joursDepuisDernierContact, joursDepuisDerniereTransaction: e.data.joursDepuisDerniereTransaction,
      },
      update: {
        score: e.data.score, potentiel: e.data.potentiel, cycleVie: e.data.cycleVie as never,
        encoursCredit: e.data.encoursCredit, soldeEpargne: e.data.soldeEpargne, ancienneteMois: e.data.ancienneteMois,
        joursDepuisDernierContact: e.data.joursDepuisDernierContact, joursDepuisDerniereTransaction: e.data.joursDepuisDerniereTransaction, calculeAt: new Date(),
      },
    })),
  );

  return { traites: ecritures.length, par_cycle: parCycle };
}
