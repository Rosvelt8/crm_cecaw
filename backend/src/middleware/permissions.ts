import { Request, Response, NextFunction } from 'express';
import { error } from '../lib/response';
import { droitsEffectifs } from '../lib/rbac';

/**
 * Exige au moins un des droits listés (`domaine:VERBE`).
 *
 * Remplace `requireRole` pour les modules de la refonte : le contrôle porte sur
 * l'action et non sur l'étiquette du rôle, ce qui permet à un même utilisateur
 * de cumuler des fonctions sans que les routes aient à le savoir.
 *
 * Un droit refusé ne peut pas être contourné par URL : la vérification s'exécute
 * côté serveur sur chaque requête, après `authenticate`.
 */
export function requirePermission(...requis: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return error(res, 'Non authentifié', 401);
      const droits = await droitsEffectifs(req.user.sub, req.user.role);
      if (!requis.some((code) => droits.has(code))) {
        return error(res, `Accès refusé : droit requis ${requis.join(' ou ')}`, 403);
      }
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

/** Test ponctuel dans un service, quand le droit dépend de l'état de l'entité. */
export async function possede(req: Request, code: string): Promise<boolean> {
  if (!req.user) return false;
  return (await droitsEffectifs(req.user.sub, req.user.role)).has(code);
}
