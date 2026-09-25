import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created, noContent } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { renvoyerSms, traiterFileSms, smsConfigure } from '../../lib/sms';
import { appelerSysteme } from '../../lib/echanges';
import { signerHmac } from '../../lib/crypto';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);
const journal = (req: Request, action: string, type: string, id: number, description: string) =>
  createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'notifications', action, entiteType: type, entiteId: id, description });

// ─── Notifications de l'utilisateur connecté (aucun droit particulier : chacun lit les siennes) ───
export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', wrap(async (req, res) => {
  const { skip, take, page, perPage } = parsePagination(req.query as Record<string, unknown>);
  const where = { utilisateurId: req.user!.sub, ...(req.query.lu === 'false' ? { lu: false } : {}) };
  const [items, total, nonLues] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { utilisateurId: req.user!.sub, lu: false } }),
  ]);
  return success(res, items, 200, { ...paginationMeta(page, perPage, total), non_lues: nonLues });
}));

notificationsRouter.get('/non-lues', wrap(async (req, res) =>
  success(res, { non_lues: await prisma.notification.count({ where: { utilisateurId: req.user!.sub, lu: false } }) })));

notificationsRouter.post('/lues', wrap(async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { utilisateurId: req.user!.sub, lu: false }, data: { lu: true, luAt: new Date() } });
  return success(res, { marquees: r.count });
}));

notificationsRouter.post('/:id/lu', wrap(async (req, res) => {
  // Le filtre sur l'utilisateur empêche de marquer la notification d'un autre.
  const r = await prisma.notification.updateMany({ where: { id: pid(req), utilisateurId: req.user!.sub }, data: { lu: true, luAt: new Date() } });
  if (r.count === 0) throw new ErreurMetier('Notification introuvable', 404);
  return success(res, { lu: true });
}));

notificationsRouter.delete('/:id', wrap(async (req, res) => {
  await prisma.notification.deleteMany({ where: { id: pid(req), utilisateurId: req.user!.sub } });
  return noContent(res);
}));

// ─── Administration de la communication ──────────────────────────────────────
export const communicationRouter = Router();
communicationRouter.use(authenticate);

const declencheurSchema = z.object({
  evenement: z.string().min(3).max(80), libelle: z.string().min(3).max(200),
  destinataire: z.string().regex(/^(acteur|roles|client|utilisateur:\w+)$/, "Destinataire invalide : acteur, roles, client ou utilisateur:<champ>"),
  role_codes: z.array(z.string().regex(/^R\d{2}$/)).optional(),
  canaux: z.array(z.enum(['in_app', 'sms', 'email'])).min(1),
  titre: z.string().min(1).max(200), gabarit: z.string().min(1).max(500), actif: z.boolean().optional(),
});

communicationRouter.get('/declencheurs', can('communication:VIEW'), wrap(async (_req, res) =>
  success(res, await prisma.declencheurNotification.findMany({ orderBy: [{ evenement: 'asc' }, { id: 'asc' }] }))));

communicationRouter.post('/declencheurs', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const b = declencheurSchema.parse(req.body);
  if (b.destinataire === 'roles' && !b.role_codes?.length) throw new ErreurMetier('Indiquez au moins un rôle destinataire.', 422);
  const d = await prisma.declencheurNotification.create({ data: { evenement: b.evenement, libelle: b.libelle, destinataire: b.destinataire, roleCodes: (b.role_codes ?? undefined) as never, canaux: b.canaux, titre: b.titre, gabarit: b.gabarit, actif: b.actif ?? true } });
  await journal(req, 'CREATE_DECLENCHEUR', 'declencheur', d.id, `Déclencheur « ${d.libelle} » créé`);
  return created(res, d);
}));

communicationRouter.put('/declencheurs/:id', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const b = declencheurSchema.partial().parse(req.body);
  const d = await prisma.declencheurNotification.update({ where: { id: pid(req) }, data: { ...b, roleCodes: b.role_codes as never, role_codes: undefined } as never });
  await journal(req, 'UPDATE_DECLENCHEUR', 'declencheur', d.id, `Déclencheur « ${d.libelle} » modifié`);
  return success(res, d);
}));

communicationRouter.get('/sms', can('communication:VIEW'), wrap(async (req, res) => {
  const where = req.query.statut ? { statut: req.query.statut as never } : {};
  const [items, resume] = await Promise.all([
    prisma.messageSms.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.messageSms.groupBy({ by: ['statut'], _count: true }),
  ]);
  return success(res, { items, resume: Object.fromEntries(resume.map((r) => [r.statut, r._count])), passerelle_configuree: smsConfigure() });
}));

communicationRouter.post('/sms/traiter', can('communication:CONFIGURE'), wrap(async (_req, res) => success(res, await traiterFileSms())));
communicationRouter.post('/sms/:id/renvoyer', can('communication:CONFIGURE'), wrap(async (req, res) => success(res, await renvoyerSms(pid(req)))));

communicationRouter.get('/evenements', can('communication:VIEW'), wrap(async (_req, res) =>
  success(res, await prisma.evenementMetier.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }))));

// ─── Intégrations : webhooks sortants et journal des échanges ────────────────
export const integrationRouter = Router();
integrationRouter.use(authenticate);

const webhookSchema = z.object({
  nom: z.string().min(2).max(150),
  url: z.string().url().refine((u) => /^https?:\/\//.test(u), 'URL http(s) attendue'),
  evenements: z.array(z.string().min(1)).min(1), actif: z.boolean().optional(),
});

const masquerSecret = <T extends { secret: string }>(w: T) => ({ ...w, secret: `${w.secret.slice(0, 4)}…` });

integrationRouter.get('/webhooks', can('integration:VIEW'), wrap(async (_req, res) =>
  success(res, (await prisma.abonnementWebhook.findMany({ orderBy: { id: 'asc' } })).map(masquerSecret))));

integrationRouter.post('/webhooks', can('integration:CONFIGURE'), wrap(async (req, res) => {
  const b = webhookSchema.parse(req.body);
  const secret = randomBytes(24).toString('hex');
  const w = await prisma.abonnementWebhook.create({ data: { nom: b.nom, url: b.url, evenements: b.evenements, secret, actif: b.actif ?? true } });
  await journal(req, 'CREATE_WEBHOOK', 'webhook', w.id, `Webhook « ${w.nom} » créé`);
  // Le secret n'est montré qu'à la création : il sert à vérifier la signature X-CECAW-Signature.
  return created(res, { ...w, secret });
}));

integrationRouter.put('/webhooks/:id', can('integration:CONFIGURE'), wrap(async (req, res) => {
  const b = webhookSchema.partial().parse(req.body);
  const w = await prisma.abonnementWebhook.update({ where: { id: pid(req) }, data: { ...b, ...(b.actif ? { echecsConsecutifs: 0 } : {}) } });
  await journal(req, 'UPDATE_WEBHOOK', 'webhook', w.id, `Webhook « ${w.nom} » modifié`);
  return success(res, masquerSecret(w));
}));

integrationRouter.delete('/webhooks/:id', can('integration:CONFIGURE'), wrap(async (req, res) => {
  await prisma.abonnementWebhook.delete({ where: { id: pid(req) } });
  await journal(req, 'DELETE_WEBHOOK', 'webhook', pid(req), `Webhook #${pid(req)} supprimé`);
  return noContent(res);
}));

integrationRouter.post('/webhooks/:id/test', can('integration:CONFIGURE'), wrap(async (req, res) => {
  const w = await prisma.abonnementWebhook.findUnique({ where: { id: pid(req) } });
  if (!w) throw new ErreurMetier('Webhook introuvable', 404);
  const corps = JSON.stringify({ id: 0, evenement: 'test', date: new Date().toISOString(), donnees: { message: 'Événement de test CECAW' } });
  const r = await appelerSysteme('webhook', w.url, { headers: { 'Content-Type': 'application/json', 'X-CECAW-Signature': `sha256=${signerHmac(w.secret, corps)}`, 'X-CECAW-Evenement': 'test' }, corps, reference: `webhook:${w.id}:test` });
  return success(res, { ok: r.ok, statut_http: r.statut, erreur: r.erreur ?? null });
}));

integrationRouter.get('/journal-echanges', can('integration:VIEW', 'integration:AUDIT'), wrap(async (req, res) => {
  const { skip, take, page, perPage } = parsePagination(req.query as Record<string, unknown>);
  const where = { ...(req.query.systeme ? { systeme: String(req.query.systeme) } : {}), ...(req.query.statut ? { statut: String(req.query.statut) } : {}) };
  const [items, total] = await Promise.all([prisma.journalEchange.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.journalEchange.count({ where })]);
  return success(res, items, 200, paginationMeta(page, perPage, total));
}));
