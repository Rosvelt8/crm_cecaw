import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created } from '../../lib/response';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';

/**
 * Historique des interactions (compléments stratégiques, point 2) : mémoire chronologique des
 * contacts, demandes, réclamations, rendez-vous et engagements pris avec un prospect ou un
 * client, en dehors du cadre d'une tournée planifiée. Journal d'audit : aucune suppression,
 * seulement création (et correction du résumé en cas de faute de frappe).
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

const schema = z.object({
  type: z.enum(['appel', 'rendez_vous', 'visite', 'reclamation', 'document', 'engagement', 'autre']),
  canal: z.enum(['presentiel', 'telephone', 'sms', 'whatsapp', 'email', 'autre']).nullish(),
  client_id: z.coerce.number().int().positive().optional(),
  prospect_id: z.coerce.number().int().positive().optional(),
  resume: z.string().min(1).max(4000),
  engagement: z.string().max(2000).nullish(),
  prochaine_action_at: z.string().nullish(),
  date_interaction: z.string().optional(),
}).refine((b) => Boolean(b.client_id) !== Boolean(b.prospect_id), {
  message: 'Précisez client_id ou prospect_id (l\'un des deux, pas les deux)',
});

const include = {
  auteur: { select: { id: true, prenom: true, nom: true } },
  client: { select: { id: true, nom: true, prenom: true } },
  prospect: { select: { id: true, nom: true, prenom: true } },
} as const;

const router = Router();
router.use(authenticate);

router.get('/', can('crm:VIEW'), wrap(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  if (!q.client_id && !q.prospect_id) throw new ErreurMetier('Précisez client_id ou prospect_id.', 422);
  const { skip, take, page, perPage } = parsePagination(q);
  const where = {
    ...(q.client_id ? { clientId: parseInt(String(q.client_id), 10) } : {}),
    ...(q.prospect_id ? { prospectId: parseInt(String(q.prospect_id), 10) } : {}),
    ...(q.type ? { type: q.type as never } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.interaction.findMany({ where, include, orderBy: { dateInteraction: 'desc' }, skip, take }),
    prisma.interaction.count({ where }),
  ]);
  return success(res, items, 200, paginationMeta(page, perPage, total));
}));

router.post('/', can('crm:CREATE', 'crm:UPDATE'), wrap(async (req, res) => {
  const b = schema.parse(req.body);
  if (b.client_id) {
    await prisma.client.findUniqueOrThrow({ where: { id: b.client_id }, select: { id: true } }).catch(() => { throw new ErreurMetier('Client introuvable', 404); });
  }
  if (b.prospect_id) {
    await prisma.prospect.findUniqueOrThrow({ where: { id: b.prospect_id }, select: { id: true } }).catch(() => { throw new ErreurMetier('Prospect introuvable', 404); });
  }
  const i = await prisma.interaction.create({
    data: {
      type: b.type as never, canal: (b.canal ?? null) as never, clientId: b.client_id, prospectId: b.prospect_id,
      auteurId: req.user!.sub, resume: b.resume, engagement: b.engagement ?? null,
      prochaineActionAt: b.prochaine_action_at ? new Date(b.prochaine_action_at) : null,
      dateInteraction: b.date_interaction ? new Date(b.date_interaction) : new Date(),
    },
    include,
  });
  await createLog({
    utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined,
    module: 'marketing', action: 'CREATE_INTERACTION', entiteType: 'interaction', entiteId: i.id,
    description: `${b.type} avec ${b.client_id ? `le client #${b.client_id}` : `le prospect #${b.prospect_id}`}`,
  });
  return created(res, i);
}));

/** Actions de suivi (« prochaine action ») à venir pour le commercial connecté, non encore réalisées. */
router.get('/mes-actions', can('crm:VIEW'), wrap(async (req, res) => {
  const items = await prisma.interaction.findMany({
    where: { auteurId: req.user!.sub, prochaineActionAt: { not: null, gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } },
    include, orderBy: { prochaineActionAt: 'asc' }, take: 100,
  });
  return success(res, items);
}));

export default router;
