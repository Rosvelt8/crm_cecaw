import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created } from '../../lib/response';
import * as svc from './parametrages.service';

const nb = z.coerce.number().nonnegative().nullish();
const entier = z.coerce.number().int().nonnegative().nullish();
const schema = z.object({
  produit_id: z.coerce.number().int().positive(),
  date_effet: z.string().min(1),
  taux_interet_annuel: nb, taux_penalite_retard: nb, taux_remuneration_epargne: nb,
  frais_dossier: nb, frais_dossier_pct: nb, commission: nb,
  montant_min: nb, montant_max: nb, duree_min_mois: entier, duree_max_mois: entier,
  mode_amortissement: z.enum(['constant', 'degressif', 'in_fine']).nullish(),
  age_min: entier, age_max: entier, anciennete_activite_min_mois: entier, quotite_cessible_max_pct: nb,
  conditions_eligibilite: z.unknown().optional(),
});

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

const router = Router();
router.use(authenticate);
router.get('/produits/:id', can('produits:VIEW', 'credit:VIEW'), wrap(async (req, res) => success(res, await svc.lister(parseInt(req.params.id, 10)))));
router.get('/produits/:id/en-vigueur', can('produits:VIEW', 'credit:VIEW'), wrap(async (req, res) => success(res, await svc.enVigueur(parseInt(req.params.id, 10)))));
router.post('/', can('produits:CONFIGURE'), wrap(async (req, res) => created(res, await svc.creer(req.user!, schema.parse(req.body) as never))));
router.put('/produits/:id/type', can('produits:CONFIGURE'), wrap(async (req, res) =>
  success(res, await svc.definirType(req.user!, parseInt(req.params.id, 10), z.object({ type: z.enum(['epargne', 'credit', 'autre']) }).parse(req.body).type))));

export default router;
