import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { authenticate, JwtPayload } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier, rolesEffectifs } from '../../lib/rbac';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { comptabiliser } from '../../lib/compta';
import { emettre } from '../../lib/notifier';
import { alerter } from '../../lib/conformite';
import { DocumentPdf, montantPdf, datePdf } from '../../lib/pdf';

/**
 * Collecte : journées, contrôle par le superviseur, rapprochement avec la caisse, portefeuilles
 * et reçus numériques. Trois acteurs distincts interviennent : le collecteur clôture, le
 * superviseur contrôle, la caisse rapproche (les fonctions sont séparées, jamais cumulées
 * par la même personne sur la même journée).
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);

async function perimetre(actor: JwtPayload): Promise<Prisma.JourneeCollecteWhereInput> {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (['R03', 'R14', 'R15'].some((r) => roles.has(r))) return {};
  if (['R04', 'R12', 'R09'].some((r) => roles.has(r))) return actor.agenceId ? { agent: { utilisateur: { agenceId: actor.agenceId } } } : { id: -1 };
  return { agent: { utilisateurId: actor.sub } };
}

const inclureJournee = {
  agent: { select: { id: true, matricule: true, utilisateurId: true, utilisateur: { select: { prenom: true, nom: true, agenceId: true } } } },
  controlePar: { select: { id: true, prenom: true, nom: true } },
  rapprochePar: { select: { id: true, prenom: true, nom: true } },
} as const;

async function journeeVisible(actor: JwtPayload, id: number) {
  const j = await prisma.journeeCollecte.findFirst({ where: { id, ...(await perimetre(actor)) }, include: inclureJournee });
  if (!j) throw new ErreurMetier('Journée de collecte introuvable', 404);
  return j;
}

const nomAgent = (j: { agent: { utilisateur: { prenom: string; nom: string } } }) => `${j.agent.utilisateur.prenom} ${j.agent.utilisateur.nom}`;
const journal = (a: JwtPayload, action: string, id: number, description: string) =>
  createLog({ utilisateurId: a.sub, utilisateurLabel: a.email, agenceId: a.agenceId ?? undefined, module: 'collecte', action, entiteType: 'journee_collecte', entiteId: id, description });

const router = Router();
router.use(authenticate);

// ── Journées ────────────────────────────────────────────────────────────────
router.get('/journees', can('collecte:VIEW'), wrap(async (req, res) => {
  const { skip, take, page, perPage } = parsePagination(req.query as Record<string, unknown>);
  const where: Prisma.JourneeCollecteWhereInput = { ...(await perimetre(req.user!)) };
  if (req.query.statut) where.statut = req.query.statut as never;
  if (req.query.agent_id) where.agentId = parseInt(String(req.query.agent_id), 10);
  if (req.query.date_debut || req.query.date_fin) {
    where.date = {
      ...(req.query.date_debut ? { gte: new Date(String(req.query.date_debut)) } : {}),
      ...(req.query.date_fin ? { lte: new Date(String(req.query.date_fin)) } : {}),
    };
  }
  const [items, total] = await Promise.all([
    prisma.journeeCollecte.findMany({ where, include: inclureJournee, skip, take, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
    prisma.journeeCollecte.count({ where }),
  ]);
  return success(res, items, 200, paginationMeta(page, perPage, total));
}));

router.get('/journees/:id', can('collecte:VIEW'), wrap(async (req, res) => {
  const j = await journeeVisible(req.user!, pid(req));
  const transactions = await prisma.transaction.findMany({
    where: { journeeId: j.id }, orderBy: { createdAt: 'asc' },
    include: { compte: { select: { numero: true, client: { select: { id: true, nom: true, prenom: true } } } } },
  });
  return success(res, { ...j, transactions });
}));

router.post('/journees/:id/cloturer', can('collecte:EXECUTE', 'collecte:CREATE'), wrap(async (req, res) => {
  const j = await journeeVisible(req.user!, pid(req));
  if (j.statut !== 'ouverte') throw new ErreurMetier('Cette journée est déjà clôturée.', 409);
  if (j.agent.utilisateurId !== req.user!.sub) throw new ErreurMetier("Seul le collecteur concerné clôture sa journée.", 403);
  await prisma.journeeCollecte.update({ where: { id: j.id }, data: { statut: 'cloturee', clotureAt: new Date() } });
  await journal(req.user!, 'CLOTURE_JOURNEE', j.id, `Clôture de la journée du ${j.date.toISOString().slice(0, 10)} : ${Number(j.totalCollecte)}`);
  void emettre('collecte.journee_cloturee', { entiteType: 'journee_collecte', entiteId: j.id, agenceId: j.agent.utilisateur.agenceId, acteurId: req.user!.sub, donnees: { agent: nomAgent(j), date: j.date.toISOString().slice(0, 10), total: Number(j.totalCollecte), nb: j.nbOperations, lien: '/dashboard/collecte/journees' } });
  return success(res, { statut: 'cloturee' });
}));

router.post('/journees/:id/controle', can('collecte:APPROVE', 'collecte:REJECT'), wrap(async (req, res) => {
  const b = z.object({ decision: z.enum(['controlee', 'rejetee']), commentaire: z.string().optional() }).parse(req.body);
  const j = await journeeVisible(req.user!, pid(req));
  if (j.statut !== 'cloturee') throw new ErreurMetier("Seule une journée clôturée peut être contrôlée.", 409);
  if (j.agent.utilisateurId === req.user!.sub) throw new ErreurMetier('Vous ne pouvez pas contrôler votre propre journée de collecte.', 403);
  if (b.decision === 'rejetee' && !b.commentaire?.trim()) throw new ErreurMetier('Un commentaire est obligatoire pour rejeter une journée.', 422);
  await prisma.journeeCollecte.update({ where: { id: j.id }, data: { statut: b.decision, controleParId: req.user!.sub, controleAt: new Date(), commentaireControle: b.commentaire ?? null } });
  await journal(req.user!, b.decision === 'controlee' ? 'CONTROLE_JOURNEE' : 'REJET_JOURNEE', j.id, `Journée de ${nomAgent(j)} : ${b.decision}`);
  return success(res, { statut: b.decision });
}));

router.post('/journees/:id/rouvrir', can('collecte:UPDATE'), wrap(async (req, res) => {
  const j = await journeeVisible(req.user!, pid(req));
  if (j.statut !== 'rejetee') throw new ErreurMetier('Seule une journée rejetée peut être rouverte.', 409);
  await prisma.journeeCollecte.update({ where: { id: j.id }, data: { statut: 'ouverte', clotureAt: null, controleParId: null, controleAt: null } });
  await journal(req.user!, 'REOUVERTURE_JOURNEE', j.id, `Journée de ${nomAgent(j)} rouverte pour correction`);
  return success(res, { statut: 'ouverte' });
}));

router.post('/journees/:id/rapprochement', can('collecte:EXECUTE'), wrap(async (req, res) => {
  const b = z.object({ montant_verse: z.coerce.number().nonnegative() }).parse(req.body);
  const j = await journeeVisible(req.user!, pid(req));
  if (j.statut !== 'controlee') throw new ErreurMetier("Le rapprochement suit le contrôle du superviseur.", 409);
  if (j.agent.utilisateurId === req.user!.sub) throw new ErreurMetier('Vous ne pouvez pas rapprocher votre propre journée.', 403);
  if (j.controleParId === req.user!.sub) throw new ErreurMetier('Le contrôle et le rapprochement doivent être faits par des personnes différentes.', 403);

  const ecart = arrondi(b.montant_verse - Number(j.totalCollecte));
  await prisma.journeeCollecte.update({ where: { id: j.id }, data: { statut: 'rapprochee', montantVerse: b.montant_verse, ecart, rapprocheParId: req.user!.sub, rapprocheAt: new Date() } });
  await journal(req.user!, 'RAPPROCHEMENT_JOURNEE', j.id, `Journée de ${nomAgent(j)} : versé ${b.montant_verse} pour ${Number(j.totalCollecte)} collectés (écart ${ecart})`);
  if (ecart !== 0) {
    await comptabiliser.ecartCollecte({ journeeId: j.id, ecart, agentLibelle: nomAgent(j), date: j.date, acteurId: req.user!.sub });
    await alerter({
      code: 'ecart_collecte', niveau: 'eleve', titre: `Écart de collecte de ${ecart} FCFA`, description: `Journée du ${j.date.toISOString().slice(0, 10)} de ${nomAgent(j)}.`,
      empreinte: `ecart:${j.id}`, entiteType: 'journee_collecte', entiteId: j.id, agenceId: j.agent.utilisateur.agenceId,
    });
    void emettre('collecte.ecart', { entiteType: 'journee_collecte', entiteId: j.id, agenceId: j.agent.utilisateur.agenceId, acteurId: req.user!.sub, donnees: { ecart, agent: nomAgent(j), date: j.date.toISOString().slice(0, 10), lien: '/dashboard/collecte/journees' } });
  }
  return success(res, { statut: 'rapprochee', ecart });
}));

// ── Portefeuilles de collecte ───────────────────────────────────────────────
router.get('/portefeuilles/:agentId', can('collecte:VIEW'), wrap(async (req, res) => {
  const agentId = parseInt(req.params.agentId, 10);
  const items = await prisma.portefeuilleCollecte.findMany({ where: { agentId, actif: true }, include: { client: { select: { id: true, nom: true, prenom: true, telephone: true, quartier: true, latitude: true, longitude: true } } }, orderBy: { affecteAt: 'desc' } });
  return success(res, items);
}));

router.put('/portefeuilles/:agentId', can('collecte:UPDATE'), wrap(async (req, res) => {
  const agentId = parseInt(req.params.agentId, 10);
  const { client_ids } = z.object({ client_ids: z.array(z.coerce.number().int().positive()) }).parse(req.body);
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, include: { utilisateur: { select: { agenceId: true } } } });
  if (!agent) throw new ErreurMetier('Agent introuvable', 404);
  const roles = await rolesEffectifs(req.user!.sub, req.user!.role);
  if (!roles.has('R03') && req.user!.agenceId && agent.utilisateur.agenceId !== req.user!.agenceId) throw new ErreurMetier("Cet agent appartient à une autre agence.", 403);

  const clients = await prisma.client.findMany({ where: { id: { in: client_ids } }, select: { id: true, agenceId: true } });
  const horsAgence = clients.filter((c) => agent.utilisateur.agenceId && c.agenceId !== agent.utilisateur.agenceId);
  if (horsAgence.length > 0) throw new ErreurMetier(`${horsAgence.length} client(s) n'appartiennent pas à l'agence de l'agent.`, 422);
  if (clients.length !== new Set(client_ids).size) throw new ErreurMetier('Un ou plusieurs clients sont introuvables.', 404);

  await prisma.$transaction([
    prisma.portefeuilleCollecte.updateMany({ where: { agentId, actif: true, clientId: { notIn: client_ids } }, data: { actif: false } }),
    ...client_ids.map((clientId) => prisma.portefeuilleCollecte.upsert({ where: { agentId_clientId: { agentId, clientId } }, create: { agentId, clientId, affecteParId: req.user!.sub }, update: { actif: true, affecteParId: req.user!.sub, affecteAt: new Date() } })),
  ]);
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'collecte', action: 'AFFECTATION_PORTEFEUILLE', entiteType: 'agent', entiteId: agentId, description: `Portefeuille de l'agent #${agentId} : ${client_ids.length} client(s)` });
  return success(res, { agent_id: agentId, nb_clients: client_ids.length });
}));

// ── Reçu numérique ──────────────────────────────────────────────────────────
async function recuVisible(actor: JwtPayload, id: number) {
  const t = await prisma.transaction.findUnique({
    where: { id },
    include: { compte: { select: { numero: true, produit: { select: { nom: true } }, client: { select: { id: true, nom: true, prenom: true, telephone: true, agenceId: true, agence: { select: { nom: true } } } } } }, agent: { select: { utilisateurId: true, matricule: true, utilisateur: { select: { prenom: true, nom: true } } } } },
  });
  if (!t) throw new ErreurMetier('Opération introuvable', 404);
  const roles = await rolesEffectifs(actor.sub, actor.role);
  const global = ['R03', 'R14', 'R15'].some((r) => roles.has(r));
  const agence = ['R04', 'R12', 'R09'].some((r) => roles.has(r)) && actor.agenceId === t.compte.client.agenceId;
  if (!global && !agence && t.agent.utilisateurId !== actor.sub) throw new ErreurMetier('Opération introuvable', 404);
  return t;
}

router.get('/recus/:id', can('collecte:VIEW'), wrap(async (req, res) => {
  const t = await recuVisible(req.user!, pid(req));
  return success(res, { numero: t.recuNumero, type: t.type, montant: Number(t.montant), solde_apres: Number(t.soldeApres), date: t.createdAt, compte: t.compte.numero, client: `${t.compte.client.prenom ?? ''} ${t.compte.client.nom}`.trim(), agent: `${t.agent.utilisateur.prenom} ${t.agent.utilisateur.nom}` });
}));

router.get('/recus/:id/pdf', can('collecte:VIEW'), wrap(async (req, res) => {
  const t = await recuVisible(req.user!, pid(req));
  const doc = new DocumentPdf(`Recu ${t.recuNumero ?? t.id}`);
  doc.titre('CECAW FINANCE - Reçu de ' + (t.type === 'credit' ? 'versement' : 'retrait'));
  doc.champ('Reçu n°', t.recuNumero ?? String(t.id));
  doc.champ('Date', `${datePdf(t.createdAt)} ${t.createdAt.toISOString().slice(11, 16)} UTC`);
  doc.champ('Agence', t.compte.client.agence.nom);
  doc.espace();
  doc.champ('Client', `${t.compte.client.prenom ?? ''} ${t.compte.client.nom}`.trim());
  doc.champ('Compte', `${t.compte.numero} (${t.compte.produit.nom})`);
  doc.champ('Opération', t.type === 'credit' ? 'Versement' : 'Retrait');
  doc.champ('Montant', montantPdf(Number(t.montant)));
  doc.champ('Solde après opération', montantPdf(Number(t.soldeApres)));
  doc.champ('Agent', `${t.agent.utilisateur.prenom} ${t.agent.utilisateur.nom} (${t.agent.matricule})`);
  doc.espace(16);
  doc.ligne('Ce reçu est généré par le système et fait foi de l\'opération enregistrée.', 8.5);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="recu-${t.recuNumero ?? t.id}.pdf"`);
  res.send(doc.build());
}));

export default router;

