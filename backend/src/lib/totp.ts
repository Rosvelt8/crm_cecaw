import { createHmac, randomBytes } from 'crypto';

/**
 * TOTP (RFC 6238) : codes à 6 chiffres, pas de 30 s, HMAC-SHA1, compatibles avec
 * Google Authenticator, Microsoft Authenticator, Authy, etc. Implémenté sans dépendance.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encoder(buf: Buffer): string {
  let bits = 0;
  let valeur = 0;
  let sortie = '';
  for (const octet of buf) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) { sortie += ALPHABET[(valeur >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) sortie += ALPHABET[(valeur << (5 - bits)) & 31];
  return sortie;
}

export function base32Decoder(texte: string): Buffer {
  const propre = texte.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];
  for (const c of propre) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error('Secret TOTP invalide');
    valeur = (valeur << 5) | idx;
    bits += 5;
    if (bits >= 8) { octets.push((valeur >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(octets);
}

export const genererSecret = () => base32Encoder(randomBytes(20));

export function codeTotp(secretBase32: string, tempsMs = Date.now(), pas = 30, chiffres = 6): string {
  const compteur = Math.floor(tempsMs / 1000 / pas);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(compteur));
  const h = createHmac('sha1', base32Decoder(secretBase32)).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** chiffres).padStart(chiffres, '0');
}

/** Renvoie le numéro de pas TOTP qui correspond au code (fenêtre ±1), ou null. */
export function pasTotpValide(secretBase32: string, code: string, tempsMs = Date.now(), fenetre = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  for (let d = -fenetre; d <= fenetre; d++) {
    const t = tempsMs + d * 30_000;
    if (codeTotp(secretBase32, t) === code) return Math.floor(t / 1000 / 30);
  }
  return null;
}

/** Accepte le pas courant et un pas de part et d'autre, pour absorber l'écart d'horloge du téléphone. */
export function verifierTotp(secretBase32: string, code: string, tempsMs = Date.now(), fenetre = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  for (let d = -fenetre; d <= fenetre; d++) {
    if (codeTotp(secretBase32, tempsMs + d * 30_000) === code) return true;
  }
  return false;
}

export const urlOtpauth = (secret: string, compte: string, emetteur = 'CECAW Finance 360') =>
  `otpauth://totp/${encodeURIComponent(`${emetteur}:${compte}`)}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=6&period=30`;
