import { Request, Response, NextFunction } from 'express';
import * as svc from './logs.service';
import { success } from '../../lib/response';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await svc.list(req.user!, req.query as Record<string, unknown>);
    return success(res, items, 200, meta);
  } catch (e) { return next(e); }
};
