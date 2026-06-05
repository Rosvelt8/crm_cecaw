import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './utilisateurs.service';
import { success, created, noContent, error } from '../../lib/response';

const schema = z.object({
  nom: z.string().min(1).max(100),
  prenom: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'backoffice', 'agent']),
  fonction: z.string().optional(),
  agence_id: z.number().int().positive(),
  equipe_id: z.number().int().positive().optional(),
  actif: z.boolean().optional(),
});

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await svc.list(req.user!, req.query as Record<string, unknown>);
    return success(res, items, 200, meta);
  } catch (e) { return next(e); }
};

export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getOne(parseInt(req.params.id, 10))); } catch (e) { return next(e); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schema.parse(req.body);
    const { user, mot_de_passe_initial } = await svc.create(body, req.user!);
    return created(res, user, { mot_de_passe_initial });
  } catch (e) { return next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schema.partial().parse(req.body);
    return success(res, await svc.update(parseInt(req.params.id, 10), body, req.user!));
  } catch (e) { return next(e); }
};

export const toggle = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.toggle(parseInt(req.params.id, 10), req.user!)); } catch (e) { return next(e); }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pwd = await svc.resetPassword(parseInt(req.params.id, 10), req.user!);
    return success(res, { message: 'Mot de passe réinitialisé' }, 200, { nouveau_mot_de_passe: pwd });
  } catch (e) { return next(e); }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { new_password, new_password_confirmation } = req.body as { new_password?: string; new_password_confirmation?: string };
    if (!new_password || new_password.length < 6) return error(res, 'Minimum 6 caractères requis', 422);
    if (new_password !== new_password_confirmation) return error(res, 'Les mots de passe ne correspondent pas', 422);
    await svc.changePassword(parseInt(req.params.id, 10), new_password, req.user!);
    return success(res, { message: 'Mot de passe mis à jour' });
  } catch (e) { return next(e); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try { await svc.remove(parseInt(req.params.id, 10), req.user!); return noContent(res); } catch (e) { return next(e); }
};
