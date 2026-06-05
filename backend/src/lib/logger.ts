import prisma from './prisma';
import { ModuleLog } from '@prisma/client';

interface LogParams {
  utilisateurId?: number;
  utilisateurLabel: string;
  agenceId?: number;
  module: ModuleLog;
  action: string;
  entiteType: string;
  entiteId: string | number;
  description?: string;
  impact?: string;
}

export async function createLog(params: LogParams) {
  try {
    await prisma.log.create({
      data: {
        utilisateurId: params.utilisateurId ?? null,
        utilisateurLabel: params.utilisateurLabel,
        agenceId: params.agenceId ?? null,
        module: params.module,
        action: params.action,
        entiteType: params.entiteType,
        entiteId: String(params.entiteId),
        description: params.description,
        impact: params.impact,
      },
    });
  } catch {
    // Log failures must not break the main request
  }
}
