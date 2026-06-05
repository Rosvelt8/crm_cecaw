import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './comptes.service';
import { success, created } from '../../lib/response';
import { StatutCompte } from '@prisma/client';

const compteSchema = z.object({
  produit_id: z.number().int().positive(),
  solde_initial: z.number().min(0).optional(),
  date_ouverture: z.string().optional(),
});

const transactionSchema = z.object({
  type: z.enum(['credit', 'debit']),
  montant: z.number().positive(),
  motif: z.string().optional(),
  agent_id: z.number().int().positive(),
});

export const listByClient = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.listByClient(parseInt(req.params.client_id, 10))); } catch (e) { return next(e); }
};

export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await svc.getOne(parseInt(req.params.id, 10))); } catch (e) { return next(e); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = compteSchema.parse(req.body);
    return created(res, await svc.create(parseInt(req.params.client_id, 10), body, req.user!));
  } catch (e) { return next(e); }
};

export const updateStatut = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statut } = z.object({ statut: z.nativeEnum(StatutCompte) }).parse(req.body);
    return success(res, await svc.updateStatut(parseInt(req.params.id, 10), statut, req.user!));
  } catch (e) { return next(e); }
};

export const listTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await svc.listTransactions(parseInt(req.params.compte_id, 10), req.query as Record<string, unknown>);
    return success(res, items, 200, meta);
  } catch (e) { return next(e); }
};

export const createTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = transactionSchema.parse(req.body);
    return created(res, await svc.createTransaction(parseInt(req.params.compte_id, 10), body));
  } catch (e) { return next(e); }
};
