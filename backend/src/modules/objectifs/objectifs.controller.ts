import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './objectifs.service';
import { success, created, noContent } from '../../lib/response';

const schema = z.object({
  titre: z.string().min(1).max(200),
  produit_id: z.number().int().positive().nullish(),
  categorie: z.enum(['produit', 'commercial', 'collecte', 'credit', 'recouvrement', 'nouveaux_clients', 'cross_selling', 'up_selling']).optional(),
  agence_id: z.number().int().positive().nullish(),
  zone_id: z.number().int().positive().nullish(),
  cible: z.number().positive(),
  unite: z.enum(['clients', 'montant', 'produits_client', 'panier_moyen']),
  periodicite: z.enum(['semaine', 'mois', 'trimestre']),
  date_debut: z.string(),
  date_fin: z.string(),
  assignation_type: z.enum(['equipe', 'agents', 'institution', 'agence', 'zone']),
  equipe_id: z.number().int().positive().optional(),
  agent_ids: z.array(z.number().int().positive()).optional(),
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

/** Projection de tendance et cible réajustée suggérée (compléments stratégiques, point 14). */
export const projection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const o = await svc.getOne(parseInt(req.params.id, 10));
    const { projeterAvancement, estIndicateurDeStock } = await import('./objectifs.calcul');
    return success(res, projeterAvancement(o.dateDebut, o.dateFin, Number(o.cible), Number(o.realise), new Date(), estIndicateurDeStock(o.unite)));
  } catch (e) { return next(e); }
};

/** Le cross/up-selling se mesure en nombre de clients : toute autre unité serait remplie d'un comptage. */
function verifierUnite(categorie: string | undefined, unite: string | undefined) {
  if ((categorie === 'cross_selling' || categorie === 'up_selling') && unite !== 'clients') {
    throw Object.assign(new Error("Un objectif de cross-selling ou d'up-selling se mesure en nombre de clients."), { status: 422 });
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schema.parse(req.body);
    verifierUnite(body.categorie, body.unite);
    return created(res, await svc.create(body, req.user!));
  } catch (e) { return next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = schema.partial().parse(req.body);
    if (body.categorie !== undefined || body.unite !== undefined) {
      const actuel = await svc.getOne(id);
      verifierUnite(body.categorie ?? actuel.categorie, body.unite ?? actuel.unite);
    }
    return success(res, await svc.update(id, body as Record<string, unknown>, req.user!));
  } catch (e) { return next(e); }
};

export const updateRealise = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { realise } = z.object({ realise: z.number().min(0) }).parse(req.body);
    return success(res, await svc.updateRealise(parseInt(req.params.id, 10), realise, req.user!));
  } catch (e) { return next(e); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try { await svc.remove(parseInt(req.params.id, 10), req.user!); return noContent(res); } catch (e) { return next(e); }
};
