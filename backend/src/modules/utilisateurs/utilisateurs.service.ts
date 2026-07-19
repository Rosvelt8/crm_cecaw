import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { env } from '../../config/env';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { sendBienvenue, sendResetPassword } from '../../lib/mailer';

const include = {
  agence: { select: { id: true, nom: true } },
  equipe: { select: { id: true, nom: true } },
  agent: { select: { id: true, matricule: true, secteur: true } },
} as const;

export async function list(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = {};

  // Non-admin scoped to their agence
  if (actor.role !== 'admin' && actor.agenceId) where.agenceId = actor.agenceId;
  if (query.agence_id && actor.role === 'admin') where.agenceId = parseInt(query.agence_id as string, 10);
  if (query.equipe_id) where.equipeId = parseInt(query.equipe_id as string, 10);
  if (query.role) where.role = query.role;
  if (query.search) {
    where.OR = [
      { nom: { contains: query.search as string, mode: 'insensitive' } },
      { prenom: { contains: query.search as string, mode: 'insensitive' } },
      { email: { contains: query.search as string, mode: 'insensitive' } },
    ];
  }
  if (query.fonction) where.fonction = { contains: query.fonction as string, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.utilisateur.findMany({ where, include, skip, take, orderBy: { nom: 'asc' } }),
    prisma.utilisateur.count({ where }),
  ]);
  return { items, meta: paginationMeta(page, perPage, total) };
}

export async function getOne(id: number) {
  return prisma.utilisateur.findUniqueOrThrow({ where: { id }, include });
}

export async function create(data: {
  nom: string; prenom: string; email: string; role: string;
  fonction?: string; agence_id: number; equipe_id?: number; actif?: boolean;
}, actor: JwtPayload) {
  const hash = await bcrypt.hash(env.DEFAULT_PASSWORD, 10);
  const u = await prisma.utilisateur.create({
    data: {
      nom: data.nom, prenom: data.prenom, email: data.email,
      password: hash, role: data.role as never,
      fonction: data.fonction, agenceId: data.agence_id,
      equipeId: data.equipe_id, actif: data.actif ?? true,
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'CREATE_UTILISATEUR', entiteType: 'utilisateur', entiteId: u.id, description: `Création de l'utilisateur ${u.prenom} ${u.nom}`, impact: '+1 utilisateur' });
  sendBienvenue({ to: u.email, prenom: u.prenom, nom: u.nom, email: u.email, motDePasse: env.DEFAULT_PASSWORD, role: u.role }).catch(() => {});
  return { user: u, mot_de_passe_initial: env.DEFAULT_PASSWORD };
}

export async function update(id: number, data: Partial<{
  nom: string; prenom: string; email: string; role: string;
  fonction: string; agence_id: number; equipe_id: number; actif: boolean;
}>, actor: JwtPayload) {
  const u = await prisma.utilisateur.update({
    where: { id },
    data: {
      ...(data.nom !== undefined && { nom: data.nom }),
      ...(data.prenom !== undefined && { prenom: data.prenom }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.role !== undefined && actor.role === 'admin' && { role: data.role as never }),
      ...(data.fonction !== undefined && { fonction: data.fonction }),
      ...(data.agence_id !== undefined && { agenceId: data.agence_id }),
      ...(data.equipe_id !== undefined && { equipeId: data.equipe_id }),
      ...(data.actif !== undefined && { actif: data.actif }),
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'UPDATE_UTILISATEUR', entiteType: 'utilisateur', entiteId: id, description: `Modification de l'utilisateur ${u.prenom} ${u.nom}` });
  return u;
}

export async function toggle(id: number, actor: JwtPayload) {
  const current = await prisma.utilisateur.findUniqueOrThrow({ where: { id } });
  const u = await prisma.utilisateur.update({ where: { id }, data: { actif: !current.actif } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'UPDATE_UTILISATEUR', entiteType: 'utilisateur', entiteId: id, description: `Utilisateur ${u.prenom} ${u.nom} → ${u.actif ? 'activé' : 'suspendu'}` });
  return { id: u.id, actif: u.actif };
}

export async function resetPassword(id: number, actor: JwtPayload) {
  if (actor.role === 'manager') {
    const target = await prisma.utilisateur.findUniqueOrThrow({ where: { id } });
    if (target.agenceId !== actor.agenceId) {
      throw Object.assign(new Error("Accès refusé : cet utilisateur n'appartient pas à votre agence"), { status: 403 });
    }
  }
  const hash = await bcrypt.hash(env.DEFAULT_PASSWORD, 10);
  const u = await prisma.utilisateur.update({ where: { id }, data: { password: hash } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'RESET_PASSWORD', entiteType: 'utilisateur', entiteId: id, description: `Réinitialisation du mot de passe de ${u.prenom} ${u.nom}` });
  sendResetPassword({ to: u.email, prenom: u.prenom, nom: u.nom, motDePasse: env.DEFAULT_PASSWORD }).catch(() => {});
  return env.DEFAULT_PASSWORD;
}

export async function changePassword(id: number, newPassword: string, actor: JwtPayload) {
  const hash = await bcrypt.hash(newPassword, 10);
  const u = await prisma.utilisateur.update({ where: { id }, data: { password: hash } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'CHANGE_PASSWORD', entiteType: 'utilisateur', entiteId: id, description: `Changement de mot de passe de ${u.prenom} ${u.nom} par admin` });
}

export async function remove(id: number, actor: JwtPayload) {
  const u = await prisma.utilisateur.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { prospects: true, clients: true } } },
  });
  if (u._count.prospects > 0 || u._count.clients > 0) throw Object.assign(new Error('Impossible de supprimer : utilisateur lié à des prospects ou clients. Désactivez-le plutôt.'), { status: 409 });
  await prisma.utilisateur.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'DELETE_UTILISATEUR', entiteType: 'utilisateur', entiteId: id, description: `Suppression de l'utilisateur ${u.prenom} ${u.nom}` });
}
