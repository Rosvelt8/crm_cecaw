import * as Crypto from 'expo-crypto';
import { getSecure, setSecure, getItem, setItem, removeItem } from './storage';

/**
 * Le code PIN n'est jamais stocke en clair : on garde `SHA-256(sel + code)`.
 * Le sel est tire au hasard a la configuration, ce qui empeche de comparer
 * l'empreinte a une table pre-calculee des 10 000 codes a 4 chiffres.
 */
async function hash(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function definePin(pin: string): Promise<void> {
  const salt = toHex(Crypto.getRandomBytes(16));
  await setSecure('pinSalt', salt);
  await setSecure('pinHash', await hash(pin, salt));
  await removeItem('pinAttempts');
}

export async function hasPin(): Promise<boolean> {
  return (await getSecure('pinHash')) !== null;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const [salt, expected] = await Promise.all([getSecure('pinSalt'), getSecure('pinHash')]);
  if (!salt || !expected) return false;
  return (await hash(pin, salt)) === expected;
}

export async function getAttempts(): Promise<number> {
  const raw = await getItem('pinAttempts');
  return raw ? Number(raw) || 0 : 0;
}

export async function bumpAttempts(): Promise<number> {
  const next = (await getAttempts()) + 1;
  await setItem('pinAttempts', String(next));
  return next;
}

export async function resetAttempts(): Promise<void> {
  await removeItem('pinAttempts');
}
