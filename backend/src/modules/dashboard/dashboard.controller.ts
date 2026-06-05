import { Request, Response, NextFunction } from 'express';
import * as svc from './dashboard.service';
import { success } from '../../lib/response';

export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getDashboard(req.user!)); } catch (e) { return next(e); }
};
