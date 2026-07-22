import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './equipes.service';
import { success, created, noContent } from '../../lib/response';

const schema = z.object({
  nom: z.string().min(1).max(150),
  agence_id: z.number().int().positive(),
  responsable_id: z.number().int().positive().optional().nullable(),
});

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.list(req.user!, req.query.agence_id as string | undefined)); } catch (e) { return next(e); }
};

export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getOne(parseInt(req.params.id, 10))); } catch (e) { return next(e); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try { return created(res, await svc.create(schema.parse(req.body), req.user!)); } catch (e) { return next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.update(parseInt(req.params.id, 10), schema.partial().parse(req.body), req.user!)); } catch (e) { return next(e); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try { await svc.remove(parseInt(req.params.id, 10), req.user!); return noContent(res); } catch (e) { return next(e); }
};
