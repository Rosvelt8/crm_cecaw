import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

/**
 * Chiffrement au repos des données sensibles (secret MFA, sauvegardes).
 *
 * AES-256-GCM : confidentialité et intégrité. La clé vient de DATA_ENCRYPTION_KEY
 * (64 caractères hexadécimaux). En développement, à défaut, elle est dérivée du
 * secret JWT ; en production son absence est une erreur, pour ne jamais stocker
 * de données « chiffrées » avec une clé devinable.
 */

let cleCache: Buffer | null = null;

function cle(): Buffer {
  if (cleCache) return cleCache;
  const brute = process.env.DATA_ENCRYPTION_KEY;
  if (brute) {
    if (!/^[0-9a-fA-F]{64}$/.test(brute)) throw new Error('DATA_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux (32 octets).');
    cleCache = Buffer.from(brute, 'hex');
  } else {
    if (!env.isDev) throw new Error('DATA_ENCRYPTION_KEY est obligatoire hors développement.');
    cleCache = createHash('sha256').update(`dev-only:${env.JWT_SECRET}`).digest();
  }
  return cleCache;
}

const PREFIXE = 'enc:v1:';

export const estChiffre = (v: string | null | undefined) => typeof v === 'string' && v.startsWith(PREFIXE);

export function chiffrer(clair: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cle(), iv);
  const chiffre = Buffer.concat([c.update(clair, 'utf8'), c.final()]);
  return `${PREFIXE}${Buffer.concat([iv, c.getAuthTag(), chiffre]).toString('base64')}`;
}

export function dechiffrer(valeur: string): string {
  if (!estChiffre(valeur)) return valeur; // donnée antérieure au chiffrement : lue telle quelle
  const buf = Buffer.from(valeur.slice(PREFIXE.length), 'base64');
  const d = createDecipheriv('aes-256-gcm', cle(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

export function chiffrerBuffer(data: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cle(), iv);
  const chiffre = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), chiffre]);
}

export function dechiffrerBuffer(data: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', cle(), data.subarray(0, 12));
  d.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([d.update(data.subarray(28)), d.final()]);
}

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export const signerHmac = (secret: string, corps: string) => createHmac('sha256', secret).update(corps).digest('hex');

export function egalesEnTempsConstant(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Politique de mot de passe (SÉCURITÉ 1). Renvoie les règles non respectées. */
export function verifierMotDePasse(mdp: string): string[] {
  const manques: string[] = [];
  if (mdp.length < 10) manques.push('10 caractères minimum');
  if (!/[a-z]/.test(mdp)) manques.push('une minuscule');
  if (!/[A-Z]/.test(mdp)) manques.push('une majuscule');
  if (!/\d/.test(mdp)) manques.push('un chiffre');
  if (!/[^A-Za-z0-9]/.test(mdp)) manques.push('un caractère spécial');
  return manques;
}
