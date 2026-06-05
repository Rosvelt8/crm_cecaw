import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './auth.service';
import { success, error, created } from '../../lib/response';
import { createLog } from '../../lib/logger';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const pwdSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6, 'Minimum 6 caractères requis'),
  new_password_confirmation: z.string(),
}).refine((d) => d.new_password === d.new_password_confirmation, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['new_password_confirmation'],
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await svc.login(body.email, body.password);
    if ('error' in result) return error(res, result.error, result.status);
    return success(res, result);
  } catch (e) { return next(e); }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token } = req.body as { refresh_token?: string };
    if (!refresh_token) return error(res, 'refresh_token requis', 400);
    const result = await svc.refresh(refresh_token);
    if ('error' in result) return error(res, result.error, result.status);
    return success(res, result);
  } catch (e) { return next(e); }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user) {
      await createLog({
        utilisateurId: req.user.sub,
        utilisateurLabel: req.user.email,
        agenceId: req.user.agenceId ?? undefined,
        module: 'system',
        action: 'LOGOUT',
        entiteType: 'utilisateur',
        entiteId: req.user.sub,
        description: 'Déconnexion',
      });
    }
    return success(res, null, 200);
  } catch (e) { return next(e); }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const u = await svc.getMe(req.user!.sub);
    if (!u) return error(res, 'Utilisateur introuvable', 404);
    return success(res, u);
  } catch (e) { return next(e); }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { fonction } = req.body as { fonction?: string };
    const u = await svc.updateMe(req.user!.sub, fonction ?? '');
    return success(res, u);
  } catch (e) { return next(e); }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = pwdSchema.parse(req.body);
    const result = await svc.changeMyPassword(
      req.user!.sub,
      body.current_password,
      body.new_password,
    );
    if ('error' in result) {
      return error(res, 'Validation échouée', 422, { current_password: [result.error] });
    }
    await createLog({
      utilisateurId: req.user!.sub,
      utilisateurLabel: req.user!.email,
      agenceId: req.user!.agenceId ?? undefined,
      module: 'parametres',
      action: 'CHANGE_PASSWORD',
      entiteType: 'utilisateur',
      entiteId: req.user!.sub,
      description: 'Changement de mot de passe personnel',
    });
    return success(res, { message: 'Mot de passe mis à jour' });
  } catch (e) { return next(e); }
}
