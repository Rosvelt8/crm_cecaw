import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created, noContent } from '../../lib/response';
import { createLog } from '../../lib/logger';

/**
 * Calendrier camerounais (compléments stratégiques, point 6) : fêtes nationales, religieuses,
 * scolaires et événements commerciaux, pour anticiper les campagnes (point 5). Les dates
 * religieuses mobiles sont saisies année par année (voir prisma/seed.ts) : aucun calcul du
 * calendrier lunaire n'est fait ici.
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);

const schema = z.object({
  nom: z.string().min(1).max(200),
  type: z.enum(['ferie_nationale', 'ferie_religieuse', 'scolaire', 'commercial']),
  date_debut: z.string().min(8),
  date_fin: z.string().min(8).nullish(),
  description: z.string().nullish(),
});

const router = Router();
router.use(authenticate);

router.get('/', can('communication:VIEW'), wrap(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const where: Record<string, unknown> = {};
  if (q.type) where.type = q.type;
  if (q.annee) {
    const an = parseInt(String(q.annee), 10);
    where.dateDebut = { gte: new Date(Date.UTC(an, 0, 1)), lt: new Date(Date.UTC(an + 1, 0, 1)) };
  }
  return success(res, await prisma.calendrierEvenement.findMany({ where, orderBy: { dateDebut: 'asc' } }));
}));

router.post('/', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const b = schema.parse(req.body);
  const e = await prisma.calendrierEvenement.create({
    data: { nom: b.nom, type: b.type, dateDebut: new Date(b.date_debut), dateFin: b.date_fin ? new Date(b.date_fin) : null, description: b.description ?? null },
  });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'notifications', action: 'CREATE_EVENEMENT_CALENDRIER', entiteType: 'calendrier_evenement', entiteId: e.id, description: `Création de « ${e.nom} »` });
  return created(res, e);
}));

router.put('/:id', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const e = await prisma.calendrierEvenement.update({
    where: { id: pid(req) },
    data: {
      ...(b.nom !== undefined && { nom: b.nom }), ...(b.type !== undefined && { type: b.type }),
      ...(b.date_debut !== undefined && { dateDebut: new Date(b.date_debut) }),
      ...(b.date_fin !== undefined && { dateFin: b.date_fin ? new Date(b.date_fin) : null }),
      ...(b.description !== undefined && { description: b.description }),
    },
  });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'notifications', action: 'UPDATE_EVENEMENT_CALENDRIER', entiteType: 'calendrier_evenement', entiteId: e.id, description: `Modification de « ${e.nom} »` });
  return success(res, e);
}));

router.delete('/:id', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const e = await prisma.calendrierEvenement.delete({ where: { id: pid(req) } });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'notifications', action: 'DELETE_EVENEMENT_CALENDRIER', entiteType: 'calendrier_evenement', entiteId: e.id, description: `Suppression de « ${e.nom} »` });
  return noContent(res);
}));

export default router;
