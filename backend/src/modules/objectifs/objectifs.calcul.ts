import prisma from '../../lib/prisma';
import { Objectif } from '@prisma/client';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { parametreNombre } from '../../lib/parametres';
import { emettre } from '../../lib/notifier';
import { calcStatut } from './objectifs.service';

/**
 * Calcul automatique du réalisé des objectifs (OBJECTIFS 1 à 13).
 *
 * Les catégories crédit, recouvrement, collecte et nouveaux clients se calculent depuis les
 * données réelles, sur la portée de l'objectif (institution, agence, zone, équipe ou agents).
 * Les objectifs « par produit » et « commercial » restent saisis à la main : ils ne sont pas touchés.
 */

const AUTOMATIQUES = ['credit', 'recouvrement', 'collecte', 'nouveaux_clients', 'cross_selling', 'up_selling'];

interface Portee { utilisateurIds: number[] | null; agentIds: number[] | null; agenceId?: number; zoneId?: number }

async function portee(o: Objectif): Promise<Portee> {
  if (o.assignationType === 'agence') return { utilisateurIds: null, agentIds: null, agenceId: o.agenceId ?? -1 };
  if (o.assignationType === 'zone') return { utilisateurIds: null, agentIds: null, zoneId: o.zoneId ?? -1 };
  if (o.assignationType === 'equipe') {
    const membres = await prisma.utilisateur.findMany({ where: { equipeId: o.equipeId ?? -1 }, select: { id: true, agent: { select: { id: true } } } });
    return { utilisateurIds: membres.map((m) => m.id), agentIds: membres.flatMap((m) => (m.agent ? [m.agent.id] : [])) };
  }
  if (o.assignationType === 'agents') {
    const liens = await prisma.objectifAgent.findMany({ where: { objectifId: o.id }, select: { agent: { select: { id: true, utilisateurId: true } } } });
    return { utilisateurIds: liens.map((l) => l.agent.utilisateurId), agentIds: liens.map((l) => l.agent.id) };
  }
  return { utilisateurIds: null, agentIds: null }; // institution : tout le réseau
}

/** Fin de période incluse : le dernier jour compte en entier. */
const fin = (d: Date) => new Date(d.getTime() + 86_400_000 - 1);

/** Clause `where` sur `Client` dérivée d'une portée d'objectif (institution/agence/zone/agents). */
function clientWhereDePortee(p: Portee): Record<string, unknown> {
  return {
    ...(p.agenceId ? { agenceId: p.agenceId } : {}),
    ...(p.zoneId ? { zoneId: p.zoneId } : {}),
    ...(p.utilisateurIds ? { commercialId: { in: p.utilisateurIds } } : {}),
  };
}

/**
 * Objectifs de croissance (Lot 15, doc "Customer Value Growth" §9-13) : moyenne du taux
 * d'équipement ou du panier moyen sur les clients de la portée, lue directement sur `ScoreClient`
 * (déjà recalculé par `lib/segmentation.ts`). Rattachés à l'unité plutôt qu'à la catégorie : ce
 * sont des métriques toujours calculées, jamais saisies à la main.
 */
async function calculerRealiseCroissance(o: Objectif): Promise<number> {
  const p = await portee(o);
  const scores = await prisma.scoreClient.findMany({ where: { client: clientWhereDePortee(p) }, select: { nombreProduits: true, panierMoyen: true } });
  if (scores.length === 0) return 0;
  if (o.unite === 'produits_client') return arrondi(scores.reduce((s, x) => s + x.nombreProduits, 0) / scores.length);
  return arrondi(scores.reduce((s, x) => s + Number(x.panierMoyen), 0) / scores.length);
}

/**
 * Cross-selling / up-selling (Lot 15) : compte des clients de la portée ayant acquis un nouveau
 * produit pendant la période alors qu'ils en détenaient déjà au moins un avant celle-ci — un
 * cross-sell réel, pas un nouveau client. L'up-sell affine ce comptage aux seuls cas où le
 * nouveau produit appartient à la même famille qu'un produit déjà détenu, avec un plafond
 * (`montantMax`) supérieur — même heuristique documentée que `lib/appetence.ts`.
 */
async function calculerRealiseVenteAdditionnelle(o: Objectif, p: Portee, periode: { gte: Date; lte: Date }): Promise<number> {
  const clients = await prisma.client.findMany({ where: clientWhereDePortee(p), select: { id: true } });
  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) return 0;

  // Un crédit compte dès son décaissement, même remboursé depuis (`cloturee`) ; daté par son
  // décaissement, pas par la création de la demande.
  const decaisses = { in: ['decaissee', 'cloturee'] as ('decaissee' | 'cloturee')[] };
  const [comptesAvant, demandesAvant, comptesPeriode, demandesPeriode] = await Promise.all([
    prisma.compteClient.findMany({ where: { clientId: { in: clientIds }, dateOuverture: { lt: o.dateDebut } }, select: { clientId: true } }),
    prisma.demandeCredit.findMany({ where: { clientId: { in: clientIds }, statut: decaisses, dateDecaissement: { lt: o.dateDebut } }, select: { clientId: true, produitId: true, produit: { select: { groupeId: true } } } }),
    prisma.compteClient.findMany({ where: { clientId: { in: clientIds }, dateOuverture: periode }, select: { clientId: true } }),
    prisma.demandeCredit.findMany({ where: { clientId: { in: clientIds }, statut: decaisses, dateDecaissement: periode }, select: { clientId: true, produitId: true, produit: { select: { groupeId: true } } } }),
  ]);
  const avaitDejaUnProduit = new Set([...comptesAvant.map((c) => c.clientId), ...demandesAvant.map((d) => d.clientId)]);
  const nouveauxProduitsPeriode = [...comptesPeriode, ...demandesPeriode].filter((x) => avaitDejaUnProduit.has(x.clientId));

  if (o.categorie === 'cross_selling') return new Set(nouveauxProduitsPeriode.map((x) => x.clientId)).size;

  // up_selling : parmi les nouvelles demandes de la période, celles dont le produit a un plafond
  // supérieur à un produit déjà détenu de la même famille avant cette demande.
  const produitIds = [...new Set([...demandesAvant.map((d) => d.produitId), ...demandesPeriode.map((d) => d.produitId)])];
  if (produitIds.length === 0) return 0;
  const parametrages = await prisma.parametrageProduit.findMany({ where: { produitId: { in: produitIds } }, orderBy: { dateEffet: 'desc' }, select: { produitId: true, montantMax: true } });
  const montantMaxParProduit = new Map<number, number | null>();
  for (const pm of parametrages) if (!montantMaxParProduit.has(pm.produitId)) montantMaxParProduit.set(pm.produitId, pm.montantMax !== null ? Number(pm.montantMax) : null);

  let compte = 0;
  for (const demande of demandesPeriode) {
    if (!avaitDejaUnProduit.has(demande.clientId)) continue;
    const montantMaxCandidat = montantMaxParProduit.get(demande.produitId) ?? null;
    if (montantMaxCandidat === null) continue;
    const dejaPlusPetit = demandesAvant.some((a) =>
      a.clientId === demande.clientId && a.produit.groupeId === demande.produit.groupeId &&
      (montantMaxParProduit.get(a.produitId) ?? null) !== null && (montantMaxParProduit.get(a.produitId) as number) < montantMaxCandidat,
    );
    if (dejaPlusPetit) compte++;
  }
  return compte;
}

export async function calculerRealise(o: Objectif): Promise<number | null> {
  if (o.unite === 'produits_client' || o.unite === 'panier_moyen') return calculerRealiseCroissance(o);
  if (!AUTOMATIQUES.includes(o.categorie)) return null;
  const p = await portee(o);
  const periode = { gte: o.dateDebut, lte: fin(o.dateFin) };
  const enNombre = o.unite === 'clients';

  if (o.categorie === 'cross_selling' || o.categorie === 'up_selling') return calculerRealiseVenteAdditionnelle(o, p, periode);

  if (o.categorie === 'credit') {
    const demandes = await prisma.demandeCredit.findMany({
      where: {
        statut: { in: ['decaissee', 'cloturee'] }, dateDecaissement: periode,
        ...(p.agenceId ? { agenceId: p.agenceId } : {}), ...(p.zoneId ? { zoneId: p.zoneId } : {}),
        ...(p.utilisateurIds ? { monteParId: { in: p.utilisateurIds } } : {}),
      },
      select: { montantAccorde: true, montantDemande: true },
    });
    return enNombre ? demandes.length : arrondi(demandes.reduce((s, d) => s + Number(d.montantAccorde ?? d.montantDemande), 0));
  }

  if (o.categorie === 'collecte') {
    const where = {
      type: 'credit' as const, createdAt: periode,
      ...(p.agentIds ? { agentId: { in: p.agentIds } } : {}),
      ...(p.agenceId ? { agent: { utilisateur: { agenceId: p.agenceId } } } : {}),
      ...(p.zoneId ? { compte: { client: { zoneId: p.zoneId } } } : {}),
    };
    if (enNombre) return (await prisma.transaction.findMany({ where, distinct: ['compteId'], select: { compteId: true } })).length;
    const r = await prisma.transaction.aggregate({ where, _sum: { montant: true } });
    return arrondi(Number(r._sum.montant ?? 0));
  }

  if (o.categorie === 'nouveaux_clients') {
    const n = await prisma.client.count({
      where: {
        createdAt: periode, ...(p.agenceId ? { agenceId: p.agenceId } : {}), ...(p.zoneId ? { zoneId: p.zoneId } : {}),
        ...(p.utilisateurIds ? { commercialId: { in: p.utilisateurIds } } : {}),
      },
    });
    return n;
  }

  // recouvrement : remboursements reçus sur des crédits qui étaient déjà en recouvrement au moment du paiement.
  const rbs = await prisma.remboursement.findMany({
    where: {
      datePaiement: periode,
      demande: {
        dossiersRecouvrement: { some: { ouvertAt: { lte: fin(o.dateFin) } } },
        ...(p.agenceId ? { agenceId: p.agenceId } : {}), ...(p.zoneId ? { zoneId: p.zoneId } : {}),
        ...(p.utilisateurIds ? { dossiersRecouvrement: { some: { agentId: { in: p.utilisateurIds }, ouvertAt: { lte: fin(o.dateFin) } } } } : {}),
      },
    },
    select: { montant: true, datePaiement: true, demande: { select: { dossiersRecouvrement: { select: { ouvertAt: true } } } } },
  });
  const utiles = rbs.filter((r) => r.demande.dossiersRecouvrement.some((d) => d.ouvertAt <= r.datePaiement));
  return enNombre ? utiles.length : arrondi(utiles.reduce((s, r) => s + Number(r.montant), 0));
}

/** Avancement attendu (%) à la date du jour, en supposant une progression linéaire sur la période. */
export function avancementAttendu(debut: Date, dateFin: Date, maintenant = new Date()): number {
  const total = fin(dateFin).getTime() - debut.getTime();
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, arrondi(((maintenant.getTime() - debut.getTime()) / total) * 100)));
}

/**
 * Projection de tendance et proposition de réajustement (compléments stratégiques, point 14).
 * Extrapolation linéaire simple sur le rythme observé depuis le début de la période : aucune
 * régression ni modèle statistique. La cible suggérée n'est qu'une indication ; elle ne modifie
 * jamais l'objectif elle-même — un humain l'applique volontairement via `PUT /objectifs/:id`.
 */
export interface Projection {
  jours_ecoules: number;
  jours_totaux: number;
  rythme_journalier: number;
  projection_fin_periode: number;
  ecart_projete_pct: number | null;
  cible_suggeree: number | null;
}

/** Indicateur de stock (moyenne à un instant t) plutôt que de flux cumulé sur la période. */
export const estIndicateurDeStock = (unite: string) => unite === 'produits_client' || unite === 'panier_moyen';

export function projeterAvancement(dateDebut: Date, dateFin: Date, cible: number, realise: number, maintenant = new Date(), stock = false): Projection {
  const debut = dateDebut.getTime();
  const finPeriode = fin(dateFin).getTime();
  const joursTotaux = Math.max(1, Math.round((finPeriode - debut) / 86_400_000));
  const joursEcoules = Math.max(0, Math.min(joursTotaux, Math.round((maintenant.getTime() - debut) / 86_400_000)));

  // Un panier moyen ou un taux d'équipement ne s'accumule pas au fil des jours : l'extrapoler
  // linéairement n'a pas de sens. On compare la valeur actuelle à la cible, sans projection.
  if (stock) {
    return { jours_ecoules: joursEcoules, jours_totaux: joursTotaux, rythme_journalier: 0, projection_fin_periode: realise, ecart_projete_pct: cible > 0 ? arrondi(((realise - cible) / cible) * 100) : null, cible_suggeree: null };
  }

  // Trop tôt dans la période (moins d'une semaine) : la tendance ne serait pas significative.
  if (joursEcoules < 7) {
    return { jours_ecoules: joursEcoules, jours_totaux: joursTotaux, rythme_journalier: 0, projection_fin_periode: realise, ecart_projete_pct: null, cible_suggeree: null };
  }

  const rythme = realise / joursEcoules;
  const projectionFin = arrondi(rythme * joursTotaux);
  if (cible <= 0) {
    return { jours_ecoules: joursEcoules, jours_totaux: joursTotaux, rythme_journalier: arrondi(rythme), projection_fin_periode: projectionFin, ecart_projete_pct: null, cible_suggeree: null };
  }
  const ecartPct = arrondi(((projectionFin - cible) / cible) * 100);
  // Une cible suggérée n'est proposée que si l'écart projeté est significatif (> 10 %), à la baisse
  // comme à la hausse : inutile de « suggérer » une cible quasi identique à l'actuelle.
  const cibleSuggeree = Math.abs(ecartPct) > 10 ? projectionFin : null;

  return { jours_ecoules: joursEcoules, jours_totaux: joursTotaux, rythme_journalier: arrondi(rythme), projection_fin_periode: projectionFin, ecart_projete_pct: ecartPct, cible_suggeree: cibleSuggeree };
}

export async function recalculerObjectifs(): Promise<{ recalcules: number; alertes: number }> {
  const tolerance = await parametreNombre('objectifs.tolerance_ecart_pct');
  const objectifs = await prisma.objectif.findMany({
    where: {
      dateDebut: { lte: new Date() },
      OR: [{ categorie: { in: AUTOMATIQUES as never[] } }, { unite: { in: ['produits_client', 'panier_moyen'] as never[] } }],
    },
  });
  let recalcules = 0;
  let alertes = 0;
  const aujourdhui = new Date(); aujourdhui.setUTCHours(0, 0, 0, 0);

  for (const o of objectifs) {
    // Un objectif échu depuis plus de 30 jours est figé : on ne le recalcule plus.
    if (fin(o.dateFin).getTime() < Date.now() - 30 * 86_400_000) continue;
    const realise = await calculerRealise(o);
    if (realise === null) continue;
    await prisma.objectif.update({ where: { id: o.id }, data: { realise, statut: calcStatut(Number(o.cible), realise, o.dateFin) } });
    recalcules++;

    // L'alerte d'écart compare à une progression linéaire : sans objet pour un indicateur de stock.
    if (fin(o.dateFin) < new Date() || Number(o.cible) <= 0 || estIndicateurDeStock(o.unite)) continue;
    const attendu = avancementAttendu(o.dateDebut, o.dateFin);
    const reel = arrondi((realise / Number(o.cible)) * 100);
    // Sous 25 % de la période écoulée, l'écart n'est pas significatif.
    if (attendu < 25 || attendu - reel <= tolerance || reel >= 100) continue;

    const deja = await prisma.evenementMetier.findFirst({ where: { code: 'objectif.ecart', entiteId: o.id, createdAt: { gte: aujourdhui } }, select: { id: true } });
    if (deja) continue;
    void emettre('objectif.ecart', {
      entiteType: 'objectif', entiteId: o.id, agenceId: o.agenceId,
      donnees: { titreObjectif: o.titre, realise: reel, attendu, createurId: o.createdById, lien: '/dashboard/objectifs' },
    });
    alertes++;
  }
  return { recalcules, alertes };
}
