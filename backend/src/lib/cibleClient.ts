import { z } from 'zod';

/**
 * Critères de ciblage client, partagés entre les campagnes commerciales (compléments
 * stratégiques, point 5) et les forfaits (Lot 15) : cycle de vie, marché, secteur, agence,
 * potentiel minimal. Un seul résolveur pour ne jamais faire diverger les deux usages.
 */
export const criteresCibleSchema = z.object({
  cycle_vie: z.array(z.enum(['nouveau', 'actif', 'dormant', 'a_risque', 'premium', 'perdu', 'a_reactiver'])).optional(),
  marche_id: z.number().int().positive().optional(),
  secteur_id: z.number().int().positive().optional(),
  agence_id: z.number().int().positive().optional(),
  potentiel_min: z.number().min(0).max(100).optional(),
}).strict();

export type CriteresCible = z.infer<typeof criteresCibleSchema>;

/** Résout les critères de ciblage en une clause `where` Prisma sur `Client`. */
export function resoudreCiblesClient(c: CriteresCible): Record<string, unknown> {
  const where: Record<string, unknown> = { statut: 'actif' };
  if (c.marche_id) where.marcheId = c.marche_id;
  if (c.secteur_id) where.secteurId = c.secteur_id;
  if (c.agence_id) where.agenceId = c.agence_id;
  if (c.cycle_vie?.length || c.potentiel_min !== undefined) {
    where.score = { ...(c.cycle_vie?.length ? { cycleVie: { in: c.cycle_vie } } : {}), ...(c.potentiel_min !== undefined ? { potentiel: { gte: c.potentiel_min } } : {}) };
  }
  return where;
}
