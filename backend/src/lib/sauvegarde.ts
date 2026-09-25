import { spawn } from 'child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, rename, rm, stat, writeFile, readFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { parametreNombre } from './parametres';

/**
 * Sauvegardes de la base (SÉCURITÉ 6) et reprise après incident (SÉCURITÉ 7).
 *
 * Chaque sauvegarde est un export `pg_dump` au format « custom », chiffré en AES-256-GCM par
 * flux (jamais chargé en mémoire), accompagné d'un manifeste JSON portant l'empreinte SHA-256.
 * La restauration vérifie l'empreinte avant de toucher à la base. Voir docs/RUNBOOK_REPRISE.md.
 *
 * Variables : BACKUP_DIR (défaut ./backups), PG_DUMP_PATH / PG_RESTORE_PATH (défaut : dans le PATH),
 * BACKUP_ENCRYPT ("false" pour désactiver, déconseillé), DATA_ENCRYPTION_KEY (clé, 64 hex).
 */

export const dossierSauvegardes = () => path.resolve(process.env.BACKUP_DIR ?? './backups');
const chiffrementActif = () => process.env.BACKUP_ENCRYPT !== 'false';

function cleChiffrement(): Buffer {
  const brute = process.env.DATA_ENCRYPTION_KEY;
  if (!brute || !/^[0-9a-fA-F]{64}$/.test(brute)) {
    throw new Error("DATA_ENCRYPTION_KEY (64 caractères hexadécimaux) est requise pour chiffrer les sauvegardes. Conservez-la HORS du serveur : sans elle, les sauvegardes sont illisibles.");
  }
  return Buffer.from(brute, 'hex');
}

// ─── Chiffrement de fichier par flux : [iv 12][données chiffrées][tag 16] ─────

export async function chiffrerFichier(source: string, destination: string, cle: Buffer): Promise<void> {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cle, iv);
  const sortie = createWriteStream(destination);
  sortie.write(iv);
  await pipeline(createReadStream(source), c, new Transform({
    transform(chunk, _e, cb) { cb(null, chunk); },
    flush(cb) { this.push(c.getAuthTag()); cb(); },
  }), sortie);
}

export async function dechiffrerFichier(source: string, destination: string, cle: Buffer): Promise<void> {
  const { size } = await stat(source);
  if (size < 12 + 16) throw new Error('Fichier chiffré invalide (trop court).');
  const entete = Buffer.alloc(12);
  const fh = await (await import('fs/promises')).open(source, 'r');
  try {
    await fh.read(entete, 0, 12, 0);
    const tag = Buffer.alloc(16);
    await fh.read(tag, 0, 16, size - 16);
    const d = createDecipheriv('aes-256-gcm', cle, entete);
    d.setAuthTag(tag);
    await pipeline(createReadStream(source, { start: 12, end: size - 17 }), d, createWriteStream(destination));
  } finally {
    await fh.close();
  }
}

export function empreinteFichier(fichier: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(fichier).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

// ─── Exécution des outils PostgreSQL ──────────────────────────────────────────

/** Paramètres de connexion passés par variables d'environnement : le mot de passe n'apparaît pas dans la liste des processus. */
function connexion(): { args: string[]; env: NodeJS.ProcessEnv } {
  const url = new URL(process.env.DATABASE_URL ?? '');
  return {
    args: ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', url.pathname.replace(/^\//, '')],
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
  };
}

function executer(commande: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(commande, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let erreur = '';
    p.stderr.on('data', (d) => { erreur += d.toString(); });
    p.on('error', (e) => reject(new Error(`Impossible de lancer ${commande} : ${e.message}. Installez les outils client PostgreSQL ou renseignez PG_DUMP_PATH / PG_RESTORE_PATH.`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${commande} a échoué (code ${code}) : ${erreur.trim().slice(0, 500)}`))));
  });
}

export interface Sauvegarde { fichier: string; taille: number; sha256: string; chiffree: boolean; date: string }

export async function sauvegarder(): Promise<Sauvegarde> {
  const dir = dossierSauvegardes();
  await mkdir(dir, { recursive: true });
  const chiffree = chiffrementActif();
  const cle = chiffree ? cleChiffrement() : null; // échoue tôt, avant de produire un export inutilisable

  const horodatage = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const brut = path.join(dir, `cecaw-${horodatage}.dump`);
  const { args, env } = connexion();
  await executer(process.env.PG_DUMP_PATH ?? 'pg_dump', ['--format=custom', '--no-owner', '--file', brut, ...args], env);

  let final = brut;
  if (cle) {
    final = `${brut}.enc`;
    await chiffrerFichier(brut, final, cle);
    await rm(brut, { force: true }); // le clair ne reste jamais sur le disque
  }
  const { size } = await stat(final);
  const sha256 = await empreinteFichier(final);
  const s: Sauvegarde = { fichier: path.basename(final), taille: size, sha256, chiffree: Boolean(cle), date: new Date().toISOString() };
  await writeFile(`${final}.json`, JSON.stringify(s, null, 2));
  await purger();
  return s;
}

/** Supprime les sauvegardes plus anciennes que la rétention, en conservant toujours la plus récente. */
export async function purger(): Promise<number> {
  const dir = dossierSauvegardes();
  const retentionJ = await parametreNombre('securite.retention_sauvegardes_jours');
  const liste = await listerSauvegardes();
  const limite = Date.now() - retentionJ * 86_400_000;
  let supprimees = 0;
  for (const s of liste.slice(1)) {
    if (new Date(s.date).getTime() < limite) {
      await rm(path.join(dir, s.fichier), { force: true });
      await rm(path.join(dir, `${s.fichier}.json`), { force: true });
      supprimees++;
    }
  }
  return supprimees;
}

export async function listerSauvegardes(): Promise<Sauvegarde[]> {
  const dir = dossierSauvegardes();
  let fichiers: string[];
  try { fichiers = await readdir(dir); } catch { return []; }
  const sortie: Sauvegarde[] = [];
  for (const f of fichiers.filter((x) => x.endsWith('.json'))) {
    try { sortie.push(JSON.parse(await readFile(path.join(dir, f), 'utf8'))); } catch { /* manifeste illisible : ignoré */ }
  }
  return sortie.sort((a, b) => b.date.localeCompare(a.date));
}

/** Vérifie l'intégrité (empreinte) de toutes les sauvegardes présentes. */
export async function verifierSauvegardes() {
  const dir = dossierSauvegardes();
  const resultats = [];
  for (const s of await listerSauvegardes()) {
    let integre = false;
    try { integre = (await empreinteFichier(path.join(dir, s.fichier))) === s.sha256; } catch { integre = false; }
    resultats.push({ ...s, integre });
  }
  return resultats;
}

/**
 * Restaure une sauvegarde dans la base indiquée par DATABASE_URL. DESTRUCTIF : les objets existants
 * sont remplacés. À n'exécuter que volontairement (scripts/restauration.ts demande une confirmation).
 */
export async function restaurer(fichier: string): Promise<void> {
  const dir = dossierSauvegardes();
  const complet = path.isAbsolute(fichier) ? fichier : path.join(dir, fichier);
  const manifeste = JSON.parse(await readFile(`${complet}.json`, 'utf8')) as Sauvegarde;
  if ((await empreinteFichier(complet)) !== manifeste.sha256) throw new Error("Empreinte différente du manifeste : la sauvegarde est altérée, restauration refusée.");

  let aRestaurer = complet;
  if (manifeste.chiffree) {
    aRestaurer = `${complet}.tmp.dump`;
    await dechiffrerFichier(complet, aRestaurer, cleChiffrement());
  }
  try {
    const { args, env } = connexion();
    await executer(process.env.PG_RESTORE_PATH ?? 'pg_restore', ['--clean', '--if-exists', '--no-owner', ...args, aRestaurer], env);
  } finally {
    if (aRestaurer !== complet) await rm(aRestaurer, { force: true });
  }
}

/** Utilitaire de test : vérifie qu'un aller-retour de chiffrement restitue le fichier à l'identique. */
export async function testerChiffrement(contenu: Buffer, cle: Buffer, dossier: string): Promise<boolean> {
  await mkdir(dossier, { recursive: true });
  const a = path.join(dossier, 'clair.bin');
  const b = path.join(dossier, 'chiffre.bin');
  const c = path.join(dossier, 'restitue.bin');
  await writeFile(a, contenu);
  await chiffrerFichier(a, b, cle);
  await dechiffrerFichier(b, c, cle);
  const identique = (await empreinteFichier(a)) === (await empreinteFichier(c));
  await rename(a, `${a}.bak`).catch(() => undefined);
  return identique;
}
