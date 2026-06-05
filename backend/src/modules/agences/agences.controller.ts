import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './agences.service';
import { success, created, noContent } from '../../lib/response';

const schema = z.object({
  nom: z.string().min(1).max(150),
  ville: z.string().min(1),
  adresse: z.string().optional(),
  actif: z.boolean().optional(),
});

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await svc.list(req.query.actif as string | undefined, req.query.search as string | undefined);
    return success(res, data);
  } catch (e) { return next(e); }
};

export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await svc.getOne(parseInt(req.params.id, 10));
    return success(res, data);
  } catch (e) { return next(e); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schema.parse(req.body);
    const data = await svc.create(body, req.user!);
    return created(res, data);
  } catch (e) { return next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schema.partial().parse(req.body);
    const data = await svc.update(parseInt(req.params.id, 10), body, req.user!);
    return success(res, data);
  } catch (e) { return next(e); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await svc.remove(parseInt(req.params.id, 10), req.user!);
    return noContent(res);
  } catch (e) { return next(e); }
};
