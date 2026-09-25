import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { authenticate, JwtPayload } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success } from '../../lib/response';
import { ErreurMetier, rolesEffectifs } from '../../lib/rbac';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { tableauDeBord as tableauRecouvrement } from '../recouvrement/recouvrement.service';
import { analyserTerritoire } from '../sig/sig.routes';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

async function agenceAutorisee(actor: JwtPayload, demandee?: number): Promise<number | undefined> {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (['R03', 'R13', 'R14', 'R15'].some((r) => roles.has(r))) return demandee;
  if (!actor.agenceId) throw new ErreurMetier("Aucune agence n'est associée à votre profil.", 403);
  if (demandee && demandee !== actor.agenceId) throw new ErreurMetier('Agence hors de votre périmètre.', 403);
  return actor.agenceId;
}

const idAgence = (req: Request) => (req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined);
const debutJour = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };
const pct = (a: number, b: number) => (b > 0 ? arrondi((a / b) * 100) : 0);

function periode(q: Record<string, unknown>) {
  const au = q.au ? new Date(String(q.au)) : new Date();
  const du = q.du ? new Date(String(q.du)) : new Date(au.getFullYear(), au.getMonth() - 11, 1);
  if (Number.isNaN(au.getTime()) || Number.isNaN(du.getTime())) throw new ErreurMetier('Période invalide.', 422);
  return { du, au };
}

const router = Router();
router.use(authenticate);

/** Tableau de bord crédit : pipeline, décisions, encours, remboursement, retard. */
router.get('/credit', can('analytique:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, idAgence(req));
  const { du, au } = periode(req.query as Record<string, unknown>);
  const parAgence: Prisma.DemandeCreditWhereInput = agenceId ? { agenceId } : {};
  const aujourdhui = debutJour();

  const [parStatut, decaisses, decisions, echus, encours, dossiersRetard, delais] = await Promise.all([
    prisma.demandeCredit.groupBy({ by: ['statut'], where: { ...parAgence, createdAt: { gte: du, lte: au } }, _count: true, _sum: { montantDemande: true } }),
    prisma.demandeCredit.findMany({ where: { ...parAgence, dateDecaissement: { gte: du, lte: au } }, select: { dateDecaissement: true, montantAccorde: true, montantDemande: true, produit: { select: { nom: true } }, agence: { select: { nom: true } } } }),
    prisma.decisionCredit.groupBy({ by: ['sens'], where: { createdAt: { gte: du, lte: au }, demande: parAgence }, _count: true }),
    prisma.echeance.aggregate({ where: { demande: { ...parAgence, statut: { in: ['decaissee', 'cloturee'] } }, dateEcheance: { lt: aujourdhui } }, _sum: { montantTotal: true, montantPaye: true }, _count: true }),
    prisma.echeance.aggregate({ where: { demande: { ...parAgence, statut: 'decaissee' }, statut: { not: 'payee' } }, _sum: { capital: true } }),
    prisma.echeance.count({ where: { demande: { ...parAgence, statut: 'decaissee' }, dateEcheance: { lt: aujourdhui }, statut: { not: 'payee' } } }),
    prisma.demandeCredit.findMany({ where: { ...parAgence, dateSoumission: { not: null }, dateDecision: { not: null, gte: du, lte: au } }, select: { dateSoumission: true, dateDecision: true } }),
  ]);

  const parMois = new Map<string, { nb: number; montant: number }>();
  for (const d of decaisses) {
    const m = (d.dateDecaissement as Date).toISOString().slice(0, 7);
    const c = parMois.get(m) ?? { nb: 0, montant: 0 };
    c.nb++; c.montant += Number(d.montantAccorde ?? d.montantDemande);
    parMois.set(m, c);
  }
  const parProduit = new Map<string, { nb: number; montant: number }>();
  for (const d of decaisses) {
    const c = parProduit.get(d.produit.nom) ?? { nb: 0, montant: 0 };
    c.nb++; c.montant += Number(d.montantAccorde ?? d.montantDemande);
    parProduit.set(d.produit.nom, c);
  }
  const nbDecisions = Object.fromEntries(decisions.map((d) => [d.sens, d._count]));
  const totalDecides = (nbDecisions.favorable ?? 0) + (nbDecisions.defavorable ?? 0);
  const dureesJ = delais.map((d) => ((d.dateDecision as Date).getTime() - (d.dateSoumission as Date).getTime()) / 86_400_000);
  const du_ = Number(echus._sum.montantTotal ?? 0);
  const paye = Number(echus._sum.montantPaye ?? 0);
  const par = await tableauRecouvrement(req.user!, agenceId);

  return success(res, {
    periode: { du, au },
    pipeline: parStatut.map((s) => ({ statut: s.statut, nb: s._count, montant: Number(s._sum.montantDemande ?? 0) })),
    decaissements_par_mois: [...parMois.entries()].sort().map(([mois, v]) => ({ mois, nb: v.nb, montant: arrondi(v.montant) })),
    decaissements_par_produit: [...parProduit.entries()].map(([produit, v]) => ({ produit, nb: v.nb, montant: arrondi(v.montant) })).sort((a, b) => b.montant - a.montant),
    total_decaisse: arrondi([...parMois.values()].reduce((s, v) => s + v.montant, 0)),
    nb_decaisses: decaisses.length,
    encours: Number(encours._sum.capital ?? 0),
    taux_approbation_pct: pct(nbDecisions.favorable ?? 0, totalDecides),
    delai_moyen_instruction_jours: dureesJ.length ? arrondi(dureesJ.reduce((s, x) => s + x, 0) / dureesJ.length) : null,
    taux_remboursement_pct: pct(paye, du_),
    taux_retard_pct: pct(dossiersRetard, echus._count),
    portefeuille_a_risque: { par1: par.par1, par30: par.par30, par90: par.par90 },
  });
}));

router.get('/recouvrement', can('analytique:VIEW', 'recouvrement:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, idAgence(req));
  return success(res, await tableauRecouvrement(req.user!, agenceId));
}));

/** Performance par zone : mêmes indicateurs que l'analyse de territoire, classés par potentiel. */
router.get('/zones', can('analytique:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, idAgence(req));
  return success(res, await analyserTerritoire(agenceId));
}));

/** Performance par agence : clientèle, épargne, encours, retard et collecte sur la période. */
router.get('/agences', can('analytique:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, idAgence(req));
  const { du, au } = periode(req.query as Record<string, unknown>);
  const agences = await prisma.agence.findMany({ where: { actif: true, ...(agenceId ? { id: agenceId } : {}) }, select: { id: true, nom: true } });
  const ids = agences.map((a) => a.id);
  if (ids.length === 0) return success(res, []);

  const [clients, epargne, encours, retards, decaisses, collecte, objectifs] = await Promise.all([
    prisma.client.groupBy({ by: ['agenceId'], where: { agenceId: { in: ids }, statut: 'actif' }, _count: true }),
    prisma.$queryRaw<{ agence_id: number; total: string }[]>`SELECT c.agence_id, COALESCE(SUM(cc.solde),0) AS total FROM comptes_clients cc JOIN clients c ON c.id = cc.client_id WHERE c.agence_id = ANY(${ids}) GROUP BY c.agence_id`,
    prisma.$queryRaw<{ agence_id: number; total: string }[]>`SELECT d.agence_id, COALESCE(SUM(e.capital),0) AS total FROM echeances e JOIN demandes_credit d ON d.id = e.demande_id WHERE d.statut = 'decaissee' AND e.statut <> 'payee' AND d.agence_id = ANY(${ids}) GROUP BY d.agence_id`,
    prisma.dossierRecouvrement.groupBy({ by: ['agenceId'], where: { agenceId: { in: ids }, statut: { notIn: ['regularise', 'irrecouvrable'] }, joursRetard: { gt: 30 } }, _sum: { capitalRestantDu: true } }),
    prisma.demandeCredit.groupBy({ by: ['agenceId'], where: { agenceId: { in: ids }, dateDecaissement: { gte: du, lte: au } }, _count: true, _sum: { montantAccorde: true } }),
    prisma.$queryRaw<{ agence_id: number; total: string }[]>`SELECT u.agence_id, COALESCE(SUM(t.montant),0) AS total FROM transactions t JOIN agents a ON a.id = t.agent_id JOIN utilisateurs u ON u.id = a.utilisateur_id WHERE t.type = 'credit' AND t.created_at >= ${du} AND t.created_at <= ${au} AND u.agence_id = ANY(${ids}) GROUP BY u.agence_id`,
    prisma.objectif.groupBy({ by: ['agenceId', 'statut'], where: { agenceId: { in: ids } }, _count: true }),
  ]);
  const num = <T extends { agence_id: number; total: string }>(l: T[], id: number) => Number(l.find((r) => r.agence_id === id)?.total ?? 0);

  return success(res, agences.map((a) => {
    const enc = num(encours, a.id);
    const par30 = Number(retards.find((r) => r.agenceId === a.id)?._sum.capitalRestantDu ?? 0);
    const dec = decaisses.find((d) => d.agenceId === a.id);
    const obj = objectifs.filter((o) => o.agenceId === a.id);
    const totalObj = obj.reduce((s, o) => s + o._count, 0);
    return {
      agence_id: a.id, nom: a.nom, clients_actifs: clients.find((c) => c.agenceId === a.id)?._count ?? 0, epargne: num(epargne, a.id), encours_credit: enc,
      par30_pct: pct(par30, enc), nb_decaisses: dec?._count ?? 0, montant_decaisse: Number(dec?._sum.montantAccorde ?? 0), collecte_periode: num(collecte, a.id),
      objectifs_atteints_pct: pct(obj.filter((o) => ['atteint', 'depasse'].includes(o.statut)).reduce((s, o) => s + o._count, 0), totalObj),
    };
  }).sort((a, b) => b.encours_credit - a.encours_credit));
}));

/** Performance par produit : comptes, épargne et crédits. */
router.get('/produits', can('analytique:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, idAgence(req));
  const { du, au } = periode(req.query as Record<string, unknown>);
  const produits = await prisma.produit.findMany({ where: { actif: true }, select: { id: true, nom: true, type: true, groupe: { select: { nom: true } } } });
  const comptes = await prisma.compteClient.groupBy({ by: ['produitId'], where: { ...(agenceId ? { client: { agenceId } } : {}), statut: 'actif' }, _count: true, _sum: { solde: true } });
  const credits = await prisma.demandeCredit.groupBy({ by: ['produitId'], where: { ...(agenceId ? { agenceId } : {}), dateDecaissement: { gte: du, lte: au } }, _count: true, _sum: { montantAccorde: true } });
  return success(res, produits.map((p) => ({
    produit_id: p.id, nom: p.nom, groupe: p.groupe.nom, type: p.type,
    nb_comptes: comptes.find((c) => c.produitId === p.id)?._count ?? 0, epargne: Number(comptes.find((c) => c.produitId === p.id)?._sum.solde ?? 0),
    nb_credits: credits.find((c) => c.produitId === p.id)?._count ?? 0, montant_credits: Number(credits.find((c) => c.produitId === p.id)?._sum.montantAccorde ?? 0),
  })).filter((p) => p.nb_comptes + p.nb_credits > 0).sort((a, b) => (b.epargne + b.montant_credits) - (a.epargne + a.montant_credits)));
}));

export default router;
