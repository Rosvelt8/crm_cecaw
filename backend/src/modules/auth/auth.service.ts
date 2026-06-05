import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma';
import { env } from '../../config/env';
import { AuthJwtPayload } from '../../middleware/auth';
import { createLog } from '../../lib/logger';

function signAccess(payload: Omit<AuthJwtPayload, 'iat' | 'exp'>) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

function signRefresh(sub: number) {
  return jwt.sign({ sub }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions);
}

function formatUser(u: {
  id: number; nom: string; prenom: string; email: string; role: string;
  fonction: string | null; actif: boolean; createdAt: Date;
  agence: { id: number; nom: string } | null;
  equipe: { id: number; nom: string } | null;
}) {
  return {
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    role: u.role,
    fonction: u.fonction,
    actif: u.actif,
    agence: u.agence,
    equipe: u.equipe,
    created_at: u.createdAt,
  };
}

const userInclude = {
  agence: { select: { id: true, nom: true } },
  equipe: { select: { id: true, nom: true } },
} as const;

function isRefreshPayload(payload: unknown): payload is { sub: number } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { sub?: unknown }).sub === 'number'
  );
}

export async function login(email: string, password: string) {
  const u = await prisma.utilisateur.findUnique({
    where: { email },
    include: userInclude,
  });
  if (!u || !(await bcrypt.compare(password, u.password))) {
    return { error: 'Identifiants incorrects', status: 401 };
  }
  if (!u.actif) {
    return { error: 'Compte suspendu. Contactez l\'administrateur.', status: 403 };
  }

  const payload: Omit<AuthJwtPayload, 'iat' | 'exp'> = {
    sub: u.id, email: u.email, role: u.role, agenceId: u.agenceId,
  };
  const access_token = signAccess(payload);
  const refresh_token = signRefresh(u.id);

  await createLog({
    utilisateurId: u.id,
    utilisateurLabel: `${u.prenom} ${u.nom}`,
    agenceId: u.agenceId ?? undefined,
    module: 'system',
    action: 'LOGIN',
    entiteType: 'utilisateur',
    entiteId: u.id,
    description: `Connexion de ${u.prenom} ${u.nom}`,
  });

  return {
    access_token,
    refresh_token,
    token_type: 'Bearer',
    expires_in: 900,
    user: formatUser(u),
  };
}

export async function refresh(refreshToken: string) {
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    if (!isRefreshPayload(decoded)) {
      return { error: 'Refresh token invalide', status: 401 };
    }
    const u = await prisma.utilisateur.findUnique({
      where: { id: decoded.sub },
      include: userInclude,
    });
    if (!u || !u.actif) return { error: 'Utilisateur invalide', status: 401 };

    const payload: Omit<AuthJwtPayload, 'iat' | 'exp'> = {
      sub: u.id, email: u.email, role: u.role, agenceId: u.agenceId,
    };
    const access_token = signAccess(payload);
    return { access_token, expires_in: 900 };
  } catch {
    return { error: 'Refresh token invalide', status: 401 };
  }
}

export async function getMe(userId: number) {
  return prisma.utilisateur.findUnique({
    where: { id: userId },
    include: userInclude,
  });
}

export async function updateMe(userId: number, fonction: string) {
  return prisma.utilisateur.update({
    where: { id: userId },
    data: { fonction },
    include: userInclude,
  });
}

export async function changeMyPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
) {
  const u = await prisma.utilisateur.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(currentPassword, u.password))) {
    return { error: 'Mot de passe actuel incorrect' };
  }
  if (newPassword.length < 6) {
    return { error: 'Minimum 6 caractères requis' };
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.utilisateur.update({ where: { id: userId }, data: { password: hash } });
  return { success: true };
}
