import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './objectifs.service';
import { success, created, noContent } from '../../lib/response';

const schema = z.object({
  titre: z.string().min(1).max(200),
  produit_id: z.number().int().positive(),
  cible: z.number().positive(),
  unite: z.enum(['clients', 'montant']),
  periodicite: z.enum(['semaine', 'mois', 'trimestre']),
  date_debut: z.string(),
  date_fin: z.string(),
  assignation_type: z.enum(['equipe', 'agents']),
  equipe_id: z.number().int().positive().optional(),
  agent_ids: z.array(z.number().int().positive()).optional(),
});

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await svc.list(req.user!, req.query as Record<string, unknown>);
    return success(res, items, 200, meta);
  } catch (e) { return next(e); }
};

export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getOne(parseInt(req.params.id, 10))); } catch (e) { return next(e); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try { return created(res, await svc.create(schema.parse(req.body), req.user!)); } catch (e) { return next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.update(parseInt(req.params.id, 10), schema.partial().parse(req.body) as Record<string, unknown>, req.user!)); } catch (e) { return next(e); }
};

export const updateRealise = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { realise } = z.object({ realise: z.number().min(0) }).parse(req.body);
    return success(res, await svc.updateRealise(parseInt(req.params.id, 10), realise, req.user!));
  } catch (e) { return next(e); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try { await svc.remove(parseInt(req.params.id, 10), req.user!); return noContent(res); } catch (e) { return next(e); }
};
