import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { error } from '../lib/response';
import { RoleUtilisateur } from '@prisma/client';

export interface AuthJwtPayload {
  sub: number;
  email: string;
  role: RoleUtilisateur;
  agenceId: number | null;
  iat: number;
  exp: number;
}

export type JwtPayload = AuthJwtPayload;

declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload;
    }
  }
}

function isAuthJwtPayload(payload: unknown): payload is AuthJwtPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as AuthJwtPayload).sub === 'number' &&
    typeof (payload as AuthJwtPayload).email === 'string' &&
    typeof (payload as AuthJwtPayload).role === 'string' &&
    (typeof (payload as AuthJwtPayload).agenceId === 'number' ||
      (payload as AuthJwtPayload).agenceId === null)
  );
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return error(res, 'Token manquant', 401);
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (!isAuthJwtPayload(payload)) {
      return error(res, 'Token invalide ou expirÃ©', 401);
    }
    req.user = payload;
    return next();
  } catch {
    return error(res, 'Token invalide ou expiré', 401);
  }
}
