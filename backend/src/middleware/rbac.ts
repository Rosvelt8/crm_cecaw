import { Request, Response, NextFunction } from 'express';
import { RoleUtilisateur } from '@prisma/client';
import { error } from '../lib/response';

type Role = RoleUtilisateur;

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return error(res, 'Non authentifié', 401);
    if (!roles.includes(req.user.role)) {
      return error(res, 'Accès refusé', 403);
    }
    return next();
  };
}

export const isAdmin = requireRole('admin');
export const isAdminOrManager = requireRole('admin', 'manager');
export const isAdminManagerOrBackoffice = requireRole('admin', 'manager', 'backoffice');
