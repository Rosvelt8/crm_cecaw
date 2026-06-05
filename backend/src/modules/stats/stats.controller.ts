import { Request, Response, NextFunction } from 'express';
import * as svc from './stats.service';
import { success } from '../../lib/response';

export const getKpis = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getKpis(req.user!, req.query as Record<string, unknown>)); } catch (e) { return next(e); }
};

export const getPerformancesIndividuelles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await svc.getPerformancesIndividuelles(req.user!, req.query as Record<string, unknown>);
    return success(res, items, 200, meta);
  } catch (e) { return next(e); }
};

export const getPerformancesEquipes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await svc.getPerformancesEquipes(req.user!, req.query as Record<string, unknown>);
    return success(res, items, 200, meta);
  } catch (e) { return next(e); }
};

export const getTransactionsParMois = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getTransactionsParMois(req.user!, req.query as Record<string, unknown>)); } catch (e) { return next(e); }
};

export const getProspectsParStatut = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getProspectsParStatut(req.user!, req.query as Record<string, unknown>)); } catch (e) { return next(e); }
};
