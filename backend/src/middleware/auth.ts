import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { error } from '../lib/response';
import { RoleUtilisateur } from '@prisma/client';

export interface JwtPayload {
  sub: number;
  email: string;
  role: RoleUtilisateur;
  agenceId: number | null;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return error(res, 'Token manquant', 401);
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    return next();
  } catch {
    return error(res, 'Token invalide ou expiré', 401);
  }
}
