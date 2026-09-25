import assert from 'node:assert/strict';
import { randomBytes } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { testerChiffrement, chiffrerFichier, dechiffrerFichier } from '../src/lib/sauvegarde';

(async () => {
  const dossier = process.argv[2];
  const cle = randomBytes(32);
  // 5 Mo : plusieurs blocs du flux, contrairement à un petit fichier.
  assert.equal(await testerChiffrement(randomBytes(5 * 1024 * 1024 + 7), cle, path.join(dossier, 'a')), true, 'aller-retour 5 Mo');
  assert.equal(await testerChiffrement(Buffer.from('petit'), cle, path.join(dossier, 'b')), true, 'aller-retour petit fichier');

  // Altération d'un octet : le déchiffrement doit échouer (intégrité GCM).
  const clair = path.join(dossier, 'c-clair'); const chiffre = path.join(dossier, 'c-chiffre');
  await writeFile(clair, randomBytes(1000));
  await chiffrerFichier(clair, chiffre, cle);
  const buf = await readFile(chiffre); buf[100] ^= 1; await writeFile(chiffre, buf);
  await assert.rejects(dechiffrerFichier(chiffre, path.join(dossier, 'c-out'), cle), 'octet modifié détecté');
  // Mauvaise clé.
  await writeFile(clair, randomBytes(1000)); await chiffrerFichier(clair, chiffre, cle);
  await assert.rejects(dechiffrerFichier(chiffre, path.join(dossier, 'c-out2'), randomBytes(32)), 'mauvaise clé refusée');
  console.log('sauvegarde OK');
})().catch((e) => { console.error(e); process.exit(1); });
