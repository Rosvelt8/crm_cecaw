import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './auth.service';
import { success, error, created } from '../../lib/response';
import { createLog } from '../../lib/logger';

/**
 * `identifiant` accepte une adresse email ou un matricule d'agent.
 * `email` reste accepte pour ne pas casser le back-office existant.
 */
const loginSchema = z.object({
  identifiant: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  password: z.string().min(1),
  /** « mobile » ouvre une session longue, adaptee au terrain. */
  client: z.enum(['mobile', 'web']).optional(),
}).refine((d) => Boolean(d.identifiant ?? d.email), {
  message: 'Email ou matricule requis',
  path: ['identifiant'],
});

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'Le code doit comporter de 4 a 8 chiffres'),
});

const pwdSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6, 'Minimum 6 caractères requis'),
  new_password_confirmation: z.string(),
}).refine((d) => d.new_password === d.new_password_confirmation, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['new_password_confirmation'],
});

function isServiceError(result: unknown): result is { error: string; status?: number } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    typeof (result as { error?: unknown }).error === 'string'
  );
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await svc.login(
      (body.identifiant ?? body.email) as string,
      body.password,
      body.client,
    );
    if (isServiceError(result)) return error(res, result.error, result.status);
    return success(res, result);
  } catch (e) { return next(e); }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token } = req.body as { refresh_token?: string };
    if (!refresh_token) return error(res, 'refresh_token requis', 400);
    const client = (req.body as { client?: string }).client;
    const result = await svc.refresh(refresh_token, client);
    if (isServiceError(result)) return error(res, result.error, result.status);
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

/**
 * Enregistre le code PIN de l'agent.
 *
 * Le deverrouillage de l'application reste verifie sur l'appareil, pour
 * fonctionner hors reseau. Cette copie chiffree sert a retrouver son code apres
 * une reinstallation et permet a un administrateur de le reinitialiser.
 */
export async function definirPin(req: Request, res: Response, next: NextFunction) {
  try {
    const { pin } = pinSchema.parse(req.body);
    await svc.definirPin(req.user!.sub, pin);
    return success(res, { a_code_pin: true });
  } catch (e) { return next(e); }
}

export async function verifierPin(req: Request, res: Response, next: NextFunction) {
  try {
    const { pin } = pinSchema.parse(req.body);
    return success(res, { valide: await svc.verifierPin(req.user!.sub, pin) });
  } catch (e) { return next(e); }
}

export async function etatPin(req: Request, res: Response, next: NextFunction) {
  try {
    return success(res, { a_code_pin: await svc.aCodePin(req.user!.sub) });
  } catch (e) { return next(e); }
}
