import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    err.errors.forEach((e) => {
      const key = e.path.join('.');
      if (!errors[key]) errors[key] = [];
      errors[key].push(e.message);
    });
    return res.status(422).json({ success: false, message: 'Validation échouée', errors });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Cette valeur existe déjà (doublon)' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Ressource introuvable' });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({ success: false, message: 'Contrainte de clé étrangère violée' });
    }
  }

  const message = err instanceof Error ? err.message : 'Erreur interne du serveur';
  const status = (err as { status?: number }).status ?? 500;

  if (env.isDev) console.error(err);

  return res.status(status).json({ success: false, message });
}

export function notFound(_req: Request, res: Response) {
  return res.status(404).json({ success: false, message: 'Route introuvable' });
}
