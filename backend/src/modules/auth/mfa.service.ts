import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma';
import { env } from '../../config/env';
import { createLog } from '../../lib/logger';
import { chiffrer, dechiffrer } from '../../lib/crypto';
import { genererSecret, pasTotpValide, urlOtpauth } from '../../lib/totp';
import { parametreNombre } from '../../lib/parametres';
import { emettre } from '../../lib/notifier';

/**
 * Authentification à deux facteurs (TOTP) et protection contre les tentatives répétées.
 *
 * Le secret n'est jamais stocké en clair (AES-256-GCM) et n'est activé qu'après la saisie
 * d'un premier code valide, pour ne pas enfermer l'utilisateur dehors. Un code ne peut servir
 * qu'une fois : le pas de temps consommé est mémorisé.
 */

export const JETON_MFA_DUREE_S = 300;

export function signerJetonMfa(userId: number, client?: string) {
  return jwt.sign({ sub: userId, objet: 'mfa', client: client ?? 'web' }, env.JWT_SECRET, { expiresIn: JETON_MFA_DUREE_S });
}

export function lireJetonMfa(jeton: string): { sub: number; client: string } | null {
  try {
    const p = jwt.verify(jeton, env.JWT_SECRET) as { sub?: unknown; objet?: unknown; client?: unknown };
    if (p.objet !== 'mfa' || typeof p.sub !== 'number') return null;
    return { sub: p.sub, client: typeof p.client === 'string' ? p.client : 'web' };
  } catch {
    return null;
  }
}

/** Compte échecs et blocage après trop de tentatives ; renvoie vrai si le compte vient d'être bloqué. */
export async function enregistrerEchec(userId: number, email: string): Promise<boolean> {
  const [max, dureeMin] = await Promise.all([parametreNombre('securite.echecs_avant_blocage'), parametreNombre('securite.duree_blocage_min')]);
  const u = await prisma.utilisateur.update({ where: { id: userId }, data: { tentativesEchouees: { increment: 1 } }, select: { tentativesEchouees: true, agenceId: true } });
  if (u.tentativesEchouees < max) return false;
  await prisma.utilisateur.update({ where: { id: userId }, data: { bloqueJusquA: new Date(Date.now() + dureeMin * 60_000), tentativesEchouees: 0 } });
  await createLog({ utilisateurId: userId, utilisateurLabel: email, agenceId: u.agenceId ?? undefined, module: 'securite', action: 'COMPTE_BLOQUE', entiteType: 'utilisateur', entiteId: userId, description: `Compte bloqué ${dureeMin} min après ${max} échecs de connexion` });
  void emettre('securite.compte_bloque', { entiteType: 'utilisateur', entiteId: userId, donnees: { email, lien: '/dashboard/parametres/securite' } });
  return true;
}

export async function reinitialiserEchecs(userId: number) {
  await prisma.utilisateur.update({ where: { id: userId }, data: { tentativesEchouees: 0, bloqueJusquA: null } });
}

export function messageBlocage(jusqua: Date) {
  const minutes = Math.max(1, Math.ceil((jusqua.getTime() - Date.now()) / 60_000));
  return `Compte temporairement bloqué après trop d'échecs. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`;
}

/** Première étape : génère un secret en attente et l'adresse à enregistrer dans l'application d'authentification. */
export async function preparerMfa(userId: number) {
  const u = await prisma.utilisateur.findUniqueOrThrow({ where: { id: userId } });
  if (u.mfaActif) return { error: "L'authentification à deux facteurs est déjà active.", status: 409 };
  const secret = genererSecret();
  await prisma.utilisateur.update({ where: { id: userId }, data: { mfaSecret: chiffrer(secret), mfaActif: false, mfaDernierPas: null } });
  return { secret, otpauth_url: urlOtpauth(secret, u.email) };
}

/** Deuxième étape : un premier code valide prouve que l'application est bien configurée. */
export async function activerMfa(userId: number, code: string) {
  const u = await prisma.utilisateur.findUniqueOrThrow({ where: { id: userId } });
  if (u.mfaActif) return { error: "L'authentification à deux facteurs est déjà active.", status: 409 };
  if (!u.mfaSecret) return { error: "Lancez d'abord la configuration.", status: 409 };
  const pas = pasTotpValide(dechiffrer(u.mfaSecret), code);
  if (pas === null) return { error: 'Code incorrect.', status: 422 };
  await prisma.utilisateur.update({ where: { id: userId }, data: { mfaActif: true, mfaDernierPas: pas } });
  await createLog({ utilisateurId: userId, utilisateurLabel: u.email, agenceId: u.agenceId ?? undefined, module: 'securite', action: 'MFA_ACTIVE', entiteType: 'utilisateur', entiteId: userId, description: 'Authentification à deux facteurs activée' });
  return { success: true };
}

export async function desactiverMfa(userId: number, motDePasse: string, code: string) {
  const u = await prisma.utilisateur.findUniqueOrThrow({ where: { id: userId } });
  if (!u.mfaActif || !u.mfaSecret) return { error: "L'authentification à deux facteurs n'est pas active.", status: 409 };
  if (!(await bcrypt.compare(motDePasse, u.password))) return { error: 'Mot de passe incorrect.', status: 422 };
  if (pasTotpValide(dechiffrer(u.mfaSecret), code) === null) return { error: 'Code incorrect.', status: 422 };
  await prisma.utilisateur.update({ where: { id: userId }, data: { mfaActif: false, mfaSecret: null, mfaDernierPas: null } });
  await createLog({ utilisateurId: userId, utilisateurLabel: u.email, agenceId: u.agenceId ?? undefined, module: 'securite', action: 'MFA_DESACTIVE', entiteType: 'utilisateur', entiteId: userId, description: 'Authentification à deux facteurs désactivée' });
  return { success: true };
}

/** Vérifie un code de connexion. Renvoie null si valide, sinon le message d'erreur. */
export async function verifierCodeConnexion(userId: number, code: string): Promise<{ ok: true } | { ok: false; erreur: string; status: number }> {
  const u = await prisma.utilisateur.findUniqueOrThrow({ where: { id: userId } });
  if (u.bloqueJusquA && u.bloqueJusquA > new Date()) return { ok: false, erreur: messageBlocage(u.bloqueJusquA), status: 423 };
  if (!u.mfaActif || !u.mfaSecret) return { ok: false, erreur: 'Authentification à deux facteurs non configurée.', status: 409 };

  const pas = pasTotpValide(dechiffrer(u.mfaSecret), code);
  // Un pas déjà consommé est refusé : un code intercepté ne peut pas être rejoué.
  if (pas === null || (u.mfaDernierPas !== null && pas <= u.mfaDernierPas)) {
    const bloque = await enregistrerEchec(userId, u.email);
    return { ok: false, erreur: bloque ? 'Trop d\'échecs : compte temporairement bloqué.' : 'Code incorrect.', status: bloque ? 423 : 401 };
  }
  await prisma.utilisateur.update({ where: { id: userId }, data: { mfaDernierPas: pas, tentativesEchouees: 0 } });
  return { ok: true };
}

/** Réinitialisation par un administrateur (téléphone perdu). L'utilisateur devra reconfigurer. */
export async function reinitialiserMfaAdmin(userId: number, acteur: { sub: number; email: string; agenceId: number | null }) {
  const u = await prisma.utilisateur.update({ where: { id: userId }, data: { mfaActif: false, mfaSecret: null, mfaDernierPas: null } });
  await createLog({ utilisateurId: acteur.sub, utilisateurLabel: acteur.email, agenceId: acteur.agenceId ?? undefined, module: 'securite', action: 'MFA_REINITIALISE', entiteType: 'utilisateur', entiteId: userId, description: `Authentification à deux facteurs de ${u.email} réinitialisée` });
}
