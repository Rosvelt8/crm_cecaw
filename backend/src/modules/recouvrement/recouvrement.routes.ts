import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created } from '../../lib/response';
import * as svc from './recouvrement.service';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

const relanceSchema = z.object({
  canal: z.enum(['sms', 'appel', 'visite', 'courrier', 'email']), message: z.string().optional(), resultat: z.string().optional(),
  niveau: z.coerce.number().int().min(1).max(4).optional(), latitude: lat.optional(), longitude: lng.optional(),
});
const promesseSchema = z.object({ montant: z.coerce.number().positive(), date_promise: z.string().min(8), commentaire: z.string().optional() });
const planSchema = z.object({ nb_echeances: z.coerce.number().int().min(2).max(24), premiere_date: z.string().min(8), montant_total: z.coerce.number().positive().optional() });

const router = Router();
router.use(authenticate);

router.get('/tableau-de-bord', can('recouvrement:VIEW'), wrap(async (req, res) =>
  success(res, await svc.tableauDeBord(req.user!, req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined))));

router.post('/detection', can('recouvrement:EXECUTE', 'recouvrement:APPROVE'), wrap(async (_req, res) => success(res, await svc.detecterImpayes())));

router.get('/', can('recouvrement:VIEW'), wrap(async (req, res) => {
  const { items, meta } = await svc.lister(req.user!, req.query as Record<string, unknown>);
  return success(res, items, 200, meta);
}));
router.get('/:id', can('recouvrement:VIEW'), wrap(async (req, res) => success(res, await svc.obtenir(req.user!, pid(req)))));
router.put('/:id/agent', can('recouvrement:UPDATE'), wrap(async (req, res) =>
  success(res, await svc.assigner(req.user!, pid(req), z.object({ agent_id: z.coerce.number().int().positive() }).parse(req.body).agent_id))));
router.post('/:id/relances', can('recouvrement:EXECUTE'), wrap(async (req, res) => created(res, await svc.relancer(req.user!, pid(req), relanceSchema.parse(req.body)))));
router.post('/:id/promesses', can('recouvrement:EXECUTE'), wrap(async (req, res) => created(res, await svc.creerPromesse(req.user!, pid(req), promesseSchema.parse(req.body)))));
router.put('/:id/promesses/:pid', can('recouvrement:EXECUTE'), wrap(async (req, res) =>
  success(res, await svc.traiterPromesse(req.user!, pid(req), parseInt(req.params.pid, 10), z.object({ statut: z.enum(['tenue', 'rompue', 'annulee']), montant_recu: z.coerce.number().nonnegative().optional() }).parse(req.body)))));
router.post('/:id/plans', can('recouvrement:EXECUTE'), wrap(async (req, res) => created(res, await svc.creerPlan(req.user!, pid(req), planSchema.parse(req.body)))));
router.post('/:id/plans/:planId/valider', can('recouvrement:APPROVE'), wrap(async (req, res) => success(res, await svc.validerPlan(req.user!, pid(req), parseInt(req.params.planId, 10)))));
router.post('/:id/escalade', can('recouvrement:APPROVE'), wrap(async (req, res) =>
  success(res, await svc.escalader(req.user!, pid(req), z.object({ vers: z.enum(['precontentieux', 'contentieux', 'irrecouvrable']), motif: z.string().min(10, 'Motif obligatoire (10 caractères minimum)') }).parse(req.body)))));
router.put('/:id/localisation', can('recouvrement:EXECUTE', 'recouvrement:UPDATE'), wrap(async (req, res) => {
  const b = z.object({ latitude: lat, longitude: lng }).parse(req.body);
  return success(res, await svc.localiser(req.user!, pid(req), b.latitude, b.longitude));
}));

export default router;
