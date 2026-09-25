import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './kyc.service';
import { success, created } from '../../lib/response';

const id = (req: Request) => parseInt(req.params.id, 10);

const creerSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  prospect_id: z.coerce.number().int().positive().optional(),
});
const controleSchema = z.object({
  resultat: z.enum(['conforme', 'non_conforme', 'non_applicable']),
  commentaire: z.string().optional(),
});
const pieceSchema = z.object({
  type: z.enum(['cni', 'passeport', 'permis', 'carte_sejour', 'recepisse', 'autre']),
  numero: z.string().min(1),
  autorite_delivrance: z.string().optional(),
  date_delivrance: z.string().optional(),
  date_expiration: z.string().optional(),
});

type H = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: H) => async (req: Request, res: Response, next: NextFunction) => {
  try { return await fn(req, res); } catch (e) { return next(e); }
};

export const lister = wrap(async (req, res) => {
  const { items, meta } = await svc.lister(req.user!, req.query as Record<string, unknown>);
  return success(res, items, 200, meta);
});
export const obtenir = wrap(async (req, res) => success(res, await svc.obtenir(req.user!, id(req))));
export const creer = wrap(async (req, res) => created(res, await svc.creer(req.user!, creerSchema.parse(req.body))));
export const evaluerControle = wrap(async (req, res) =>
  success(res, await svc.evaluerControle(req.user!, id(req), parseInt(req.params.cid, 10), controleSchema.parse(req.body))));
export const ajouterPieceIdentite = wrap(async (req, res) =>
  created(res, await svc.ajouterPieceIdentite(req.user!, id(req), pieceSchema.parse(req.body), req.file)));
export const joindreDocument = wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Fichier requis' });
  const { intitule, categorie } = req.body as { intitule?: string; categorie?: string };
  return created(res, await svc.joindreDocument(req.user!, id(req), req.file, intitule, categorie));
});
export const soumettre = wrap(async (req, res) => success(res, await svc.soumettre(req.user!, id(req))));
export const valider = wrap(async (req, res) => {
  const { niveau_risque } = z.object({ niveau_risque: z.enum(['faible', 'moyen', 'eleve']).optional() }).parse(req.body ?? {});
  return success(res, await svc.valider(req.user!, id(req), niveau_risque));
});
export const rejeter = wrap(async (req, res) => success(res, await svc.rejeter(req.user!, id(req), z.object({ motif: z.string().min(3) }).parse(req.body).motif)));
export const rouvrir = wrap(async (req, res) => success(res, await svc.rouvrir(req.user!, id(req))));
export const archiver = wrap(async (req, res) => success(res, await svc.archiver(req.user!, id(req))));
