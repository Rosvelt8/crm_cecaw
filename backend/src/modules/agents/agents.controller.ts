import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './agents.service';
import { success, created, noContent } from '../../lib/response';

const schema = z.object({
  utilisateur_id: z.number().int().positive(),
  matricule: z.string().min(1).max(50),
  secteur: z.string().optional(),
});

const positionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await svc.list(req.user!, req.query as Record<string, unknown>);
    return success(res, items, 200, meta);
  } catch (e) { return next(e); }
};

export const getTerrainAgents = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getTerrainAgents(req.query.agence_id as string | undefined)); } catch (e) { return next(e); }
};

export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getOne(parseInt(req.params.id, 10))); } catch (e) { return next(e); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try { return created(res, await svc.create(schema.parse(req.body), req.user!)); } catch (e) { return next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schema.omit({ utilisateur_id: true }).partial().parse(req.body);
    return success(res, await svc.update(parseInt(req.params.id, 10), body, req.user!));
  } catch (e) { return next(e); }
};

export const updatePosition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { latitude, longitude } = positionSchema.parse(req.body);
    return success(res, await svc.updatePosition(parseInt(req.params.id, 10), latitude, longitude, req.user!));
  } catch (e) { return next(e); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try { await svc.remove(parseInt(req.params.id, 10), req.user!); return noContent(res); } catch (e) { return next(e); }
};
