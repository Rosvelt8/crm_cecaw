import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { upload } from '../../middleware/upload';
import { success, created } from '../../lib/response';
import * as svc from './tournees.service';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const type = z.enum(['commerciale', 'collecte', 'recouvrement']);

const generationSchema = z.object({
  type, agent_id: z.coerce.number().int().positive(), date: z.string().min(8), zone_id: z.coerce.number().int().positive().optional(),
  max_visites: z.coerce.number().int().min(1).max(40).optional(), optimiser: z.boolean().optional(),
});
const planificationSchema = z.object({
  type, agent_id: z.coerce.number().int().positive(), date: z.string().min(8), zone_id: z.coerce.number().int().positive().optional(), optimiser: z.boolean().optional(),
  cibles: z.array(z.object({ type: z.enum(['client', 'prospect', 'dossier']), id: z.coerce.number().int().positive() })).min(1).max(40),
});
const arriveeSchema = z.object({ latitude: lat, longitude: lng, effectue_le: z.string().optional() });
const clotureSchema = z.object({
  resultat: z.enum(['realisee', 'manquee']), compte_rendu: z.string().optional(), latitude: lat.optional(), longitude: lng.optional(),
  client_uid: z.string().min(8).max(64).optional(), base_version: z.coerce.number().int().nonnegative().optional(), effectue_le: z.string().optional(),
  signature: z.object({ points: z.array(z.array(z.array(z.number()))).max(200), nom: z.string().min(1).max(150), largeur: z.number().positive(), hauteur: z.number().positive() }).optional(),
});

const router = Router();
router.use(authenticate);

// Routes fixes avant `/:id`.
router.get('/mes', can('tournees:VIEW'), wrap(async (req, res) => success(res, await svc.mesTournees(req.user!, req.query.date as string | undefined))));
router.get('/suivi/hors-zone', can('tracking:VIEW'), wrap(async (req, res) => success(res, await svc.agentsHorsZone(req.user!))));
router.get('/suivi/arrets', can('tracking:VIEW'), wrap(async (req, res) => {
  const q = z.object({ agent_id: z.coerce.number().int().positive(), date: z.string().min(8) }).parse(req.query);
  return success(res, await svc.arrets(req.user!, q.agent_id, q.date));
}));

router.get('/', can('tournees:VIEW'), wrap(async (req, res) => success(res, await svc.lister(req.user!, req.query as Record<string, unknown>))));
router.post('/generer', can('tournees:CREATE'), wrap(async (req, res) => created(res, await svc.generer(req.user!, generationSchema.parse(req.body)))));
router.post('/', can('tournees:CREATE'), wrap(async (req, res) => created(res, await svc.planifier(req.user!, planificationSchema.parse(req.body)))));
router.get('/:id', can('tournees:VIEW'), wrap(async (req, res) => success(res, await svc.obtenir(req.user!, pid(req)))));
router.get('/:id/comparaison', can('tournees:VIEW'), wrap(async (req, res) => success(res, await svc.comparaison(req.user!, pid(req)))));
router.post('/:id/optimiser', can('tournees:CREATE', 'tournees:UPDATE'), wrap(async (req, res) => success(res, await svc.reoptimiser(req.user!, pid(req)))));
router.post('/:id/demarrer', can('tournees:EXECUTE'), wrap(async (req, res) => success(res, await svc.demarrer(req.user!, pid(req)))));
router.post('/:id/terminer', can('tournees:EXECUTE'), wrap(async (req, res) => success(res, await svc.terminer(req.user!, pid(req)))));
router.post('/:id/annuler', can('tournees:CREATE', 'tournees:UPDATE'), wrap(async (req, res) =>
  success(res, await svc.annuler(req.user!, pid(req), z.object({ motif: z.string().min(3) }).parse(req.body).motif))));

// Visites : exécution sur le terrain.
router.post('/visites/:id/arrivee', can('tournees:EXECUTE'), wrap(async (req, res) => success(res, await svc.arrivee(req.user!, pid(req), arriveeSchema.parse(req.body)))));
router.post('/visites/:id/photos', can('tournees:EXECUTE'), upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Photo requise' });
  const b = z.object({ latitude: lat.optional(), longitude: lng.optional(), pris_le: z.string().optional() }).parse(req.body);
  return created(res, await svc.ajouterPhoto(req.user!, pid(req), req.file, b));
}));
router.post('/visites/:id/cloture', can('tournees:EXECUTE'), wrap(async (req, res) => success(res, await svc.cloturerVisite(req.user!, pid(req), clotureSchema.parse(req.body)))));
router.post('/visites/:id/arbitrage', can('tournees:APPROVE'), wrap(async (req, res) =>
  success(res, await svc.arbitrerConflit(req.user!, pid(req), z.object({ choix: z.enum(['serveur', 'appareil']) }).parse(req.body).choix))));

export default router;
