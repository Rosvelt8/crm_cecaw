import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma';
import { env } from '../../config/env';
import { AuthJwtPayload } from '../../middleware/auth';
import { createLog } from '../../lib/logger';
import { parametre } from '../../lib/parametres';
import { verifierMotDePasse } from '../../lib/crypto';
import { enregistrerEchec, reinitialiserEchecs, messageBlocage, signerJetonMfa, lireJetonMfa, verifierCodeConnexion, JETON_MFA_DUREE_S } from './mfa.service';

function signAccess(payload: Omit<AuthJwtPayload, 'iat' | 'exp'>, duree?: string) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: duree ?? env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

function signRefresh(sub: number) {
  return jwt.sign({ sub }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions);
}

function formatUser(u: {
  id: number; nom: string; prenom: string; email: string; role: string;
  fonction: string | null; actif: boolean; createdAt: Date; mfaActif?: boolean;
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
    mfa_actif: Boolean(u.mfaActif),
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

/**
 * Duree de vie du jeton d'acces selon le client.
 *
 * Un agent de collecte est sur le terrain, souvent sans reseau : une session de
 * quinze minutes l'obligerait a se reconnecter sans cesse, et le
 * rafraichissement echouerait justement quand la couverture manque. Le
 * back-office, lui, conserve une fenetre courte.
 */
function dureeAcces(client?: string) {
  return client === 'mobile' ? env.JWT_MOBILE_EXPIRES_IN : env.JWT_EXPIRES_IN;
}

/**
 * Recherche par email ou par matricule d'agent.
 *
 * Sur le terrain, saisir « AGT-004 » est plus rapide et moins faillible qu'une
 * adresse complete au clavier tactile.
 */
async function trouverUtilisateur(identifiant: string) {
  const valeur = identifiant.trim();

  if (valeur.includes('@')) {
    return prisma.utilisateur.findUnique({
      where: { email: valeur.toLowerCase() },
      include: userInclude,
    });
  }

  const agent = await prisma.agent.findUnique({
    where: { matricule: valeur.toUpperCase() },
    select: { utilisateurId: true },
  });
  if (!agent) return null;

  return prisma.utilisateur.findUnique({
    where: { id: agent.utilisateurId },
    include: userInclude,
  });
}

export async function login(identifiant: string, password: string, client?: string) {
  const u = await trouverUtilisateur(identifiant);
  if (u?.bloqueJusquA && u.bloqueJusquA > new Date()) {
    return { error: messageBlocage(u.bloqueJusquA), status: 423 };
  }
  if (!u || !(await bcrypt.compare(password, u.password))) {
    if (u) {
      const bloque = await enregistrerEchec(u.id, u.email);
      if (bloque) return { error: 'Trop d\'échecs : compte temporairement bloqué.', status: 423 };
    }
    return { error: 'Identifiants incorrects', status: 401 };
  }
  if (!u.actif) {
    return { error: 'Compte suspendu. Contactez l\'administrateur.', status: 403 };
  }

  // Second facteur : les jetons d'accès ne sont émis qu'après la saisie du code.
  if (u.mfaActif) {
    return { mfa_required: true, mfa_token: signerJetonMfa(u.id, client), expires_in: JETON_MFA_DUREE_S };
  }
  if (u.tentativesEchouees > 0 || u.bloqueJusquA) await reinitialiserEchecs(u.id);
  return ouvrirSession(u, client, !u.mfaActif && (await parametre<boolean>('securite.mfa_obligatoire')));
}

/** Émet les jetons et journalise la connexion. */
async function ouvrirSession(u: NonNullable<Awaited<ReturnType<typeof trouverUtilisateur>>>, client?: string, mfaARequerir = false) {

  const payload: Omit<AuthJwtPayload, 'iat' | 'exp'> = {
    sub: u.id, email: u.email, role: u.role, agenceId: u.agenceId,
  };
  const access_token = signAccess(payload, dureeAcces(client));
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
    ...(mfaARequerir ? { mfa_configuration_requise: true } : {}),
  };
}

/** Deuxième étape de connexion : le code TOTP échange le jeton temporaire contre la session. */
export async function verifierMfa(mfaToken: string, code: string) {
  const jeton = lireJetonMfa(mfaToken);
  if (!jeton) return { error: 'Session de vérification expirée : reconnectez-vous.', status: 401 };
  const r = await verifierCodeConnexion(jeton.sub, code);
  if (!r.ok) return { error: r.erreur, status: r.status };
  const u = await prisma.utilisateur.findUnique({ where: { id: jeton.sub }, include: userInclude });
  if (!u || !u.actif) return { error: 'Compte indisponible.', status: 403 };
  return ouvrirSession(u, jeton.client);
}

export async function refresh(refreshToken: string, client?: string) {
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
    const duree = dureeAcces(client);
    const access_token = signAccess(payload, duree);
    return { access_token, expires_in: duree };
  } catch {
    return { error: 'Refresh token invalide', status: 401 };
  }
}

/**
 * Profil renvoyé au client. Liste blanche : la ligne complète contient l'empreinte du mot de
 * passe, celle du PIN et le secret MFA, qui ne doivent jamais quitter le serveur.
 */
function profilPublic(u: Parameters<typeof formatUser>[0] & { agenceId: number | null; equipeId: number | null; updatedAt: Date }) {
  return { ...formatUser(u), agenceId: u.agenceId, equipeId: u.equipeId, createdAt: u.createdAt, updatedAt: u.updatedAt };
}

export async function getMe(userId: number) {
  const u = await prisma.utilisateur.findUnique({ where: { id: userId }, include: userInclude });
  return u ? profilPublic(u) : null;
}

export async function updateMe(userId: number, fonction: string) {
  const u = await prisma.utilisateur.update({ where: { id: userId }, data: { fonction }, include: userInclude });
  return profilPublic(u);
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
  const manques = verifierMotDePasse(newPassword);
  if (manques.length > 0) {
    return { error: `Mot de passe trop faible : il faut ${manques.join(', ')}.` };
  }
  if (await bcrypt.compare(newPassword, u.password)) {
    return { error: "Le nouveau mot de passe doit différer de l'actuel." };
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.utilisateur.update({ where: { id: userId }, data: { password: hash } });
  return { success: true };
}

/**
 * Code PIN de l'application mobile.
 *
 * Hache en bcrypt, comme un mot de passe : le serveur ne doit jamais pouvoir
 * relire le code d'un agent. La verification locale, sur l'appareil, reste la
 * voie normale de deverrouillage — celle-ci sert de recours.
 */
export async function definirPin(utilisateurId: number, pin: string) {
  const pinHash = await bcrypt.hash(pin, 10);
  await prisma.utilisateur.update({ where: { id: utilisateurId }, data: { pinHash } });
}

export async function verifierPin(utilisateurId: number, pin: string): Promise<boolean> {
  const u = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { pinHash: true },
  });
  if (!u?.pinHash) return false;
  return bcrypt.compare(pin, u.pinHash);
}

export async function aCodePin(utilisateurId: number): Promise<boolean> {
  const u = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { pinHash: true },
  });
  return Boolean(u?.pinHash);
}
