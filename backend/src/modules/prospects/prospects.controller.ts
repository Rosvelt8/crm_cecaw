import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './prospects.service';
import { success, created, noContent } from '../../lib/response';
import { StatutProspect } from '@prisma/client';
import prisma from '../../lib/prisma';

const createSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  telephone: z.string().min(1),
  genre: z.enum(['M', 'F', '']).optional(),
  date_naissance: z.string().optional(),
  lieu_naissance: z.string().optional(),
  nationalite: z.string().optional(),
  numero_cni: z.string().optional(),
  telephone_secondaire: z.string().optional(),
  email: z.string().email().optional(),
  adresse: z.string().optional(),
  quartier: z.string().optional(),
  ville: z.string().optional(),
  profession: z.string().optional(),
  employeur: z.string().optional(),
  secteur_activite: z.string().optional(),
  revenu_mensuel: z.string().optional(),
  situation_familiale: z.enum(['celibataire', 'marie', 'divorce', 'veuf', '']).optional(),
  nombre_enfants: z.number().int().min(0).optional(),
  referent_nom: z.string().optional(),
  referent_telephone: z.string().optional(),
  referent_relation: z.string().optional(),
  statut: z.nativeEnum(StatutProspect).optional(),
  produit_interet_id: z.number().int().positive().optional().nullable(),
  commercial_id: z.number().int().positive().optional(),
  notes: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
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
    const body = createSchema.parse(req.body);
    return created(res, await svc.create(body as Record<string, unknown>, req.user!));
  } catch (e) { return next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createSchema.partial().parse(req.body);
    return success(res, await svc.update(parseInt(req.params.id, 10), body as Record<string, unknown>, req.user!));
  } catch (e) { return next(e); }
};

export const updateStatut = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut } = z.object({ statut: z.nativeEnum(StatutProspect) }).parse(req.body);
    const result = await svc.updateStatut(parseInt(req.params.id, 10), statut, req.user!);
    return success(res, result);
  } catch (e) { return next(e); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try { await svc.remove(parseInt(req.params.id, 10), req.user!); return noContent(res); } catch (e) { return next(e); }
};

export const uploadPJ = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'Fichier requis' });
    const { intitule } = req.body as { intitule?: string };
    const prospectId = parseInt(req.params.id, 10);
    const url = `/uploads/${file.filename}`;
    const pj = await prisma.pieceJointe.create({
      data: { intitule: intitule ?? file.originalname, nomFichier: file.originalname, typeMime: file.mimetype, taille: file.size, url, prospectId },
    });
    return created(res, pj);
  } catch (e) { return next(e); }
};

export const deletePJ = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.pieceJointe.delete({ where: { id: parseInt(req.params.pj_id, 10) } });
    return noContent(res);
  } catch (e) { return next(e); }
};
