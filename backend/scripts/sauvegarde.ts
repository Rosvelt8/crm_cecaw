import 'dotenv/config';
import { sauvegarder } from '../src/lib/sauvegarde';

sauvegarder()
  .then((s) => { console.log(`Sauvegarde créée : ${s.fichier} (${s.taille} octets, ${s.chiffree ? 'chiffrée' : 'NON chiffrée'})\nSHA-256 : ${s.sha256}`); })
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
