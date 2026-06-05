import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './clients.service';
import { success, created, noContent } from '../../lib/response';
import { StatutClient } from '@prisma/client';
import prisma from '../../lib/prisma';

const schema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  telephone: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  adresse: z.string().optional(),
  ville: z.string().optional(),
  agence_id: z.number().int().positive(),
  commercial_id: z.number().int().positive().optional(),
  statut: z.nativeEnum(StatutClient).optional(),
  prospect_id: z.number().int().positive().optional().nullable(),
  notes: z.string().optional(),
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
    return created(res, await svc.create(body as Record<string, unknown>, req.user!));
  } catch (e) { return next(e); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schema.partial().parse(req.body);
    return success(res, await svc.update(parseInt(req.params.id, 10), body as Record<string, unknown>, req.user!));
  } catch (e) { return next(e); }
};

export const updateStatut = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut } = z.object({ statut: z.nativeEnum(StatutClient) }).parse(req.body);
    return success(res, await svc.updateStatut(parseInt(req.params.id, 10), statut, req.user!));
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
    const clientId = parseInt(req.params.id, 10);
    const pj = await prisma.pieceJointe.create({
      data: { intitule: intitule ?? file.originalname, nomFichier: file.originalname, typeMime: file.mimetype, taille: file.size, url: `/uploads/${file.filename}`, clientId },
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
