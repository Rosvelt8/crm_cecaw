import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate, type JwtPayload } from '../../middleware/auth';
import { success } from '../../lib/response';
import { droitsEffectifs, rolesEffectifs, ErreurMetier } from '../../lib/rbac';

/**
 * Calendrier des opérations : vue unique, en lecture seule, des dates portées par les autres
 * modules (calendrier camerounais, campagnes, objectifs, tournées, échéances et décaissements de
 * crédit, promesses et actions de recouvrement, journées de collecte, relances commerciales,
 * expirations de pièces KYC).
 *
 * Chaque source n'est servie qu'à qui possède le droit de lecture du module d'origine, et dans le
 * périmètre de l'utilisateur : direction et fonctions transverses voient tout le réseau, les
 * fonctions d'agence leur agence, les agents de terrain leurs propres opérations. Les sources
 * volumineuses (échéances, collecte) sont agrégées par jour pour rester lisibles.
 */

export type SourceAgenda =
  | 'evenement' | 'campagne' | 'objectif' | 'tournee' | 'echeance' | 'decaissement'
  | 'promesse' | 'recouvrement' | 'collecte' | 'relance' | 'kyc';

export interface ElementAgenda {
  id: string;
  source: SourceAgenda;
  titre: string;
  debut: string;
  fin?: string | null;
  details?: string;
  lien?: string;
  statut?: string;
}

const SOURCES: Record<SourceAgenda, string[]> = {
  evenement: [],
  campagne: ['communication:VIEW', 'crm:VIEW'],
  objectif: ['objectifs:VIEW'],
  tournee: ['tournees:VIEW'],
  echeance: ['credit:VIEW', 'recouvrement:VIEW'],
  decaissement: ['credit:VIEW'],
  promesse: ['recouvrement:VIEW'],
  recouvrement: ['recouvrement:VIEW'],
  collecte: ['collecte:VIEW'],
  relance: ['crm:VIEW'],
  kyc: ['kyc:VIEW'],
};

const GLOBAUX = ['R01', 'R02', 'R03', 'R08', 'R13', 'R14', 'R15'];
const AGENCE = ['R04', 'R06', 'R07', 'R09', 'R12', 'R17'];
type Perimetre = { niveau: 'global' } | { niveau: 'agence'; agenceId: number } | { niveau: 'personnel'; utilisateurId: number };

async function perimetre(actor: JwtPayload): Promise<Perimetre> {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (GLOBAUX.some((r) => roles.has(r))) return { niveau: 'global' };
  if (AGENCE.some((r) => roles.has(r)) && actor.agenceId) return { niveau: 'agence', agenceId: actor.agenceId };
  return { niveau: 'personnel', utilisateurId: actor.sub };
}

const jour = (d: Date) => d.toISOString().slice(0, 10);
const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} FCFA`;
const nomComplet = (p?: { prenom?: string | null; nom?: string | null } | null) => (p ? [p.prenom, p.nom].filter(Boolean).join(' ') : '');

async function collecter(actor: JwtPayload, source: SourceAgenda, debut: Date, fin: Date, p: Perimetre): Promise<ElementAgenda[]> {
  const periode = { gte: debut, lte: fin };
  const agence = p.niveau === 'agence' ? p.agenceId : undefined;
  const moi = p.niveau === 'personnel' ? p.utilisateurId : undefined;

  switch (source) {
    case 'evenement': {
      const ev = await prisma.calendrierEvenement.findMany({ where: { dateDebut: { lte: fin }, OR: [{ dateFin: null, dateDebut: { gte: debut } }, { dateFin: { gte: debut } }] }, orderBy: { dateDebut: 'asc' } });
      return ev.map((e) => ({ id: `evenement-${e.id}`, source, titre: e.nom, debut: jour(e.dateDebut), fin: e.dateFin ? jour(e.dateFin) : null, details: e.description ?? undefined, statut: e.type }));
    }
    case 'campagne': {
      const cc = await prisma.campagne.findMany({
        where: { statut: { not: 'annulee' }, dateDebut: { lte: fin }, OR: [{ dateFin: null, dateDebut: { gte: debut } }, { dateFin: { gte: debut } }], ...(agence ? { OR: [{ agenceId: agence }, { agenceId: null }] } : {}) },
        select: { id: true, nom: true, type: true, statut: true, dateDebut: true, dateFin: true },
      });
      return cc.map((c) => ({ id: `campagne-${c.id}`, source, titre: c.nom, debut: jour(c.dateDebut), fin: c.dateFin ? jour(c.dateFin) : null, details: `Campagne ${c.type.replace('_', ' ')}`, statut: c.statut, lien: `/dashboard/marketing/campagnes/${c.id}` }));
    }
    case 'objectif': {
      // Échéances d'objectifs : on place l'objectif sur toute sa période.
      const oo = await prisma.objectif.findMany({
        where: {
          dateDebut: { lte: fin }, dateFin: { gte: debut },
          ...(agence ? { OR: [{ agenceId: agence }, { assignationType: 'institution' }] } : {}),
          ...(moi ? { agents: { some: { agent: { utilisateurId: moi } } } } : {}),
        },
        select: { id: true, titre: true, statut: true, dateDebut: true, dateFin: true, cible: true, realise: true, campagneId: true },
      });
      return oo.map((o) => ({
        id: `objectif-${o.id}`, source, titre: o.titre, debut: jour(o.dateDebut), fin: jour(o.dateFin), statut: o.statut,
        details: `Avancement : ${Number(o.cible) > 0 ? Math.round((Number(o.realise) / Number(o.cible)) * 100) : 0} %`,
        lien: o.campagneId ? `/dashboard/marketing/campagnes/${o.campagneId}` : '/dashboard/objectifs',
      }));
    }
    case 'tournee': {
      const tt = await prisma.tournee.findMany({
        where: { date: periode, ...(agence ? { agenceId: agence } : {}), ...(moi ? { agent: { utilisateurId: moi } } : {}) },
        select: { id: true, reference: true, type: true, statut: true, date: true, agent: { select: { utilisateur: { select: { prenom: true, nom: true } } } }, _count: { select: { visites: true } } },
        take: 1000,
      });
      return tt.map((t) => ({ id: `tournee-${t.id}`, source, titre: `Tournée ${t.type} · ${nomComplet(t.agent.utilisateur)}`, debut: jour(t.date), statut: t.statut, details: `${t.reference} · ${t._count.visites} visite(s)`, lien: `/dashboard/terrain/tournees/${t.id}` }));
    }
    case 'echeance': {
      const ee = await prisma.echeance.groupBy({
        by: ['dateEcheance'],
        where: { dateEcheance: periode, statut: { not: 'payee' }, demande: { ...(agence ? { agenceId: agence } : {}), ...(moi ? { monteParId: moi } : {}) } },
        _count: true, _sum: { montantTotal: true, montantPaye: true },
      });
      return ee.map((e) => ({
        id: `echeance-${jour(e.dateEcheance)}`, source, titre: `${e._count} échéance(s) de crédit`, debut: jour(e.dateEcheance),
        details: `Reste dû : ${fcfa(Number(e._sum.montantTotal ?? 0) - Number(e._sum.montantPaye ?? 0))}`, lien: '/dashboard/credits',
      }));
    }
    case 'decaissement': {
      const dd = await prisma.demandeCredit.findMany({
        where: { dateDecaissement: periode, ...(agence ? { agenceId: agence } : {}), ...(moi ? { monteParId: moi } : {}) },
        select: { id: true, reference: true, dateDecaissement: true, montantAccorde: true, montantDemande: true, client: { select: { prenom: true, nom: true } } },
        take: 1000,
      });
      return dd.map((d) => ({ id: `decaissement-${d.id}`, source, titre: `Décaissement · ${nomComplet(d.client)}`, debut: jour(d.dateDecaissement!), details: `${d.reference} · ${fcfa(Number(d.montantAccorde ?? d.montantDemande))}`, lien: `/dashboard/credits/${d.id}` }));
    }
    case 'promesse': {
      const pp = await prisma.promessePaiement.findMany({
        where: { datePromise: periode, dossier: { ...(agence ? { agenceId: agence } : {}), ...(moi ? { agentId: moi } : {}) } },
        select: { id: true, montant: true, datePromise: true, statut: true, dossier: { select: { id: true, reference: true, client: { select: { prenom: true, nom: true } } } } },
        take: 1000,
      });
      return pp.map((x) => ({ id: `promesse-${x.id}`, source, titre: `Promesse · ${nomComplet(x.dossier.client)}`, debut: jour(x.datePromise), statut: x.statut, details: `${x.dossier.reference} · ${fcfa(Number(x.montant))}`, lien: `/dashboard/recouvrement/${x.dossier.id}` }));
    }
    case 'recouvrement': {
      const rr = await prisma.dossierRecouvrement.findMany({
        where: { prochaineActionAt: periode, clotureAt: null, ...(agence ? { agenceId: agence } : {}), ...(moi ? { agentId: moi } : {}) },
        select: { id: true, reference: true, statut: true, prochaineActionAt: true, montantImpaye: true, client: { select: { prenom: true, nom: true } } },
        take: 1000,
      });
      return rr.map((r) => ({ id: `recouvrement-${r.id}`, source, titre: `Action recouvrement · ${nomComplet(r.client)}`, debut: jour(r.prochaineActionAt!), statut: r.statut, details: `${r.reference} · impayé ${fcfa(Number(r.montantImpaye))}`, lien: `/dashboard/recouvrement/${r.id}` }));
    }
    case 'collecte': {
      const jj = await prisma.journeeCollecte.groupBy({
        by: ['date'],
        where: { date: periode, ...(agence ? { agent: { utilisateur: { agenceId: agence } } } : {}), ...(moi ? { agent: { utilisateurId: moi } } : {}) },
        _count: true, _sum: { totalCollecte: true },
      });
      return jj.map((j) => ({ id: `collecte-${jour(j.date)}`, source, titre: `${j._count} journée(s) de collecte`, debut: jour(j.date), details: `Total collecté : ${fcfa(Number(j._sum.totalCollecte ?? 0))}`, lien: '/dashboard/collecte/journees' }));
    }
    case 'relance': {
      const ii = await prisma.interaction.findMany({
        where: {
          prochaineActionAt: periode,
          ...(moi ? { auteurId: moi } : {}),
          ...(agence ? { auteur: { agenceId: agence } } : {}),
        },
        select: { id: true, type: true, prochaineActionAt: true, engagement: true, resume: true, client: { select: { id: true, prenom: true, nom: true } }, prospect: { select: { id: true, prenom: true, nom: true } }, auteur: { select: { prenom: true, nom: true } } },
        take: 1000,
      });
      return ii.map((i) => ({
        id: `relance-${i.id}`, source, titre: `Relance · ${nomComplet(i.client ?? i.prospect)}`, debut: jour(i.prochaineActionAt!),
        details: `${i.engagement ?? i.resume} (${nomComplet(i.auteur)})`.slice(0, 240),
        lien: i.client ? `/dashboard/marketing/clients/${i.client.id}` : i.prospect ? `/dashboard/marketing/prospects/${i.prospect.id}/modifier` : undefined,
      }));
    }
    case 'kyc': {
      const kk = await prisma.pieceIdentite.findMany({
        where: { dateExpiration: periode },
        select: { id: true, dateExpiration: true, type: true, dossier: { select: { id: true, client: { select: { prenom: true, nom: true, agenceId: true, commercialId: true } } } } },
        take: 1000,
      });
      return kk
        .filter((k) => (!agence || k.dossier.client?.agenceId === agence) && (!moi || k.dossier.client?.commercialId === moi))
        .map((k) => ({ id: `kyc-${k.id}`, source, titre: `Pièce expirée · ${nomComplet(k.dossier.client)}`, debut: jour(k.dateExpiration!), details: `Pièce d'identité (${k.type}) à renouveler`, lien: `/dashboard/kyc/${k.dossier.id}` }));
    }
  }
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

const router = Router();
router.use(authenticate);

/** Sources que l'utilisateur peut afficher, pour construire les filtres de l'écran. */
router.get('/sources', wrap(async (req, res) => {
  const droits = await droitsEffectifs(req.user!.sub, req.user!.role);
  return success(res, (Object.keys(SOURCES) as SourceAgenda[]).filter((s) => SOURCES[s].length === 0 || SOURCES[s].some((d) => droits.has(d))));
}));

router.get('/', wrap(async (req, res) => {
  const q = z.object({ debut: z.string().min(8), fin: z.string().min(8), sources: z.string().optional() }).parse(req.query);
  const debut = new Date(`${q.debut.slice(0, 10)}T00:00:00.000Z`);
  const fin = new Date(`${q.fin.slice(0, 10)}T23:59:59.999Z`);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin < debut) throw new ErreurMetier('Période invalide', 422);
  if (fin.getTime() - debut.getTime() > 120 * 86_400_000) throw new ErreurMetier('La période demandée ne peut pas dépasser 120 jours.', 422);

  const droits = await droitsEffectifs(req.user!.sub, req.user!.role);
  const demandees = q.sources ? (q.sources.split(',') as SourceAgenda[]).filter((s) => s in SOURCES) : (Object.keys(SOURCES) as SourceAgenda[]);
  const autorisees = demandees.filter((s) => SOURCES[s].length === 0 || SOURCES[s].some((d) => droits.has(d)));
  const p = await perimetre(req.user!);

  const resultats = await Promise.all(autorisees.map((s) => collecter(req.user!, s, debut, fin, p).catch(() => [] as ElementAgenda[])));
  const elements = resultats.flat().sort((a, b) => a.debut.localeCompare(b.debut));
  return success(res, elements, 200, { sources: autorisees, perimetre: p.niveau });
}));

export default router;
