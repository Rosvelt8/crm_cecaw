import prisma from './prisma';

/** Returns the ids of the équipes a user leads (Equipe.responsableId === userId). */
export async function getResponsableEquipeIds(userId: number): Promise<number[]> {
  const equipes = await prisma.equipe.findMany({ where: { responsableId: userId }, select: { id: true } });
  return equipes.map((e) => e.id);
}
