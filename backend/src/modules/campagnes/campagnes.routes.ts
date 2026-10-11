import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created, noContent } from '../../lib/response';
import { criteresCibleSchema } from '../../lib/cibleClient';
import * as svc from './campagnes.service';

/**
 * Module Campagnes (Marketing & CRM). Lecture ouverte au CRM comme à la communication ; la
 * création, le lancement et l'équipe relèvent de `communication:CONFIGURE` ; lier des clients ou
 * prospects à une campagne est aussi permis à qui peut modifier le CRM (`crm:UPDATE`).
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);
const ids = z.array(z.number().int().positive()).max(1000);

const VOIR = ['communication:VIEW', 'crm:VIEW'];
const GERER = ['communication:CONFIGURE'];
const LIER = ['communication:CONFIGURE', 'crm:UPDATE'];

const router = Router();
router.use(authenticate);

// Routes fixes avant `/:id`.
router.get('/evaluation', can(...VOIR), wrap(async (req, res) => success(res, await svc.evaluation(req.query as Record<string, unknown>))));
router.post('/apercu-cibles', can(...VOIR), wrap(async (req, res) => success(res, await svc.apercuCibles(criteresCibleSchema.parse(req.body?.criteres ?? {})))));

/** Personnel actif sélectionnable dans l'équipe d'une campagne (sans exiger l'administration des comptes). */
router.get('/personnel', can(...GERER), wrap(async (req, res) => success(res, await svc.personnel(String(req.query.search ?? '')))));

router.get('/', can(...VOIR), wrap(async (req, res) => success(res, await svc.lister(req.query as Record<string, unknown>))));
router.post('/', can(...GERER), wrap(async (req, res) => created(res, await svc.creer(req.user!, svc.campagneSchema.parse(req.body)))));
router.get('/:id', can(...VOIR), wrap(async (req, res) => success(res, await svc.obtenir(pid(req)))));
router.put('/:id', can(...GERER), wrap(async (req, res) => success(res, await svc.modifier(req.user!, pid(req), svc.campagneSchema.partial().parse(req.body)))));
router.delete('/:id', can(...GERER), wrap(async (req, res) => { await svc.supprimer(req.user!, pid(req)); return noContent(res); }));

router.post('/:id/lancer', can(...GERER), wrap(async (req, res) => success(res, await svc.lancer(req.user!, pid(req)))));
router.post('/:id/cloturer', can(...GERER), wrap(async (req, res) => success(res, await svc.changerStatut(req.user!, pid(req), 'terminee'))));
router.post('/:id/annuler', can(...GERER), wrap(async (req, res) => success(res, await svc.changerStatut(req.user!, pid(req), 'annulee'))));

router.get('/:id/funnel', can(...VOIR), wrap(async (req, res) => success(res, await svc.funnel(pid(req)))));
router.get('/:id/evolution', can(...VOIR), wrap(async (req, res) => success(res, await svc.evolution(pid(req)))));

// Personnes liées : cibles (clients, prospects) et équipe interne.
router.get('/:id/cibles', can(...VOIR), wrap(async (req, res) => {
  const { items, meta } = await svc.listerCibles(pid(req), req.query as Record<string, unknown>);
  return success(res, items, 200, meta);
}));
router.post('/:id/cibles', can(...LIER), wrap(async (req, res) => {
  const b = z.object({ client_ids: ids.optional(), prospect_ids: ids.optional(), note: z.string().max(1000).nullish() })
    .refine((x) => (x.client_ids?.length ?? 0) + (x.prospect_ids?.length ?? 0) > 0, 'Sélectionnez au moins une personne').parse(req.body);
  return created(res, await svc.ajouterCibles(req.user!, pid(req), b));
}));
router.delete('/:id/cibles/:cibleId', can(...LIER), wrap(async (req, res) => { await svc.retirerCible(req.user!, pid(req), parseInt(req.params.cibleId, 10)); return noContent(res); }));
router.put('/:id/membres', can(...GERER), wrap(async (req, res) =>
  success(res, await svc.definirMembres(req.user!, pid(req), z.object({ membres: z.array(svc.membreSchema).max(200) }).parse(req.body).membres))));

// Objectifs : rattacher / détacher des objectifs existants (créés depuis le module Objectifs).
router.post('/:id/objectifs', can(...GERER, 'objectifs:UPDATE'), wrap(async (req, res) =>
  success(res, await svc.lierObjectifs(req.user!, pid(req), z.object({ objectif_ids: ids.min(1) }).parse(req.body).objectif_ids, true))));
router.delete('/:id/objectifs/:objectifId', can(...GERER, 'objectifs:UPDATE'), wrap(async (req, res) =>
  success(res, await svc.lierObjectifs(req.user!, pid(req), [parseInt(req.params.objectifId, 10)], false))));

export default router;
