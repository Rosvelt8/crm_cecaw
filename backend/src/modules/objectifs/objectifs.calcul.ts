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

const AUTOMATIQUES = ['credit', 'recouvrement', 'collecte', 'nouveaux_clients'];

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

export async function calculerRealise(o: Objectif): Promise<number | null> {
  if (!AUTOMATIQUES.includes(o.categorie)) return null;
  const p = await portee(o);
  const periode = { gte: o.dateDebut, lte: fin(o.dateFin) };
  const enNombre = o.unite === 'clients';

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

export function projeterAvancement(dateDebut: Date, dateFin: Date, cible: number, realise: number, maintenant = new Date()): Projection {
  const debut = dateDebut.getTime();
  const finPeriode = fin(dateFin).getTime();
  const joursTotaux = Math.max(1, Math.round((finPeriode - debut) / 86_400_000));
  const joursEcoules = Math.max(0, Math.min(joursTotaux, Math.round((maintenant.getTime() - debut) / 86_400_000)));

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
  const objectifs = await prisma.objectif.findMany({ where: { categorie: { in: AUTOMATIQUES as never[] }, dateDebut: { lte: new Date() } } });
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

    if (fin(o.dateFin) < new Date() || Number(o.cible) <= 0) continue;
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
