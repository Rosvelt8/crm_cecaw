import 'dotenv/config';
import { createInterface } from 'readline/promises';
import { listerSauvegardes, restaurer } from '../src/lib/sauvegarde';

/**
 * Usage : npm run db:restore -- <fichier> [--oui]
 * Sans argument, liste les sauvegardes disponibles. La restauration REMPLACE les données de la base
 * désignée par DATABASE_URL ; une confirmation explicite est demandée sauf avec --oui.
 */
(async () => {
  const [fichier, ...options] = process.argv.slice(2);
  if (!fichier) {
    const liste = await listerSauvegardes();
    console.log(liste.length ? liste.map((s) => `${s.date}  ${s.fichier}  ${s.taille} octets`).join('\n') : 'Aucune sauvegarde.');
    return;
  }
  const cible = (process.env.DATABASE_URL ?? '').replace(/:\/\/[^@]*@/, '://***@');
  if (!options.includes('--oui')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const rep = await rl.question(`Restaurer ${fichier} dans ${cible} ? Les données actuelles seront remplacées. Tapez RESTAURER : `);
    rl.close();
    if (rep.trim() !== 'RESTAURER') { console.log('Abandon.'); return; }
  }
  await restaurer(fichier);
  console.log('Restauration terminée. Redémarrez l\'application puis contrôlez les données (voir docs/RUNBOOK_REPRISE.md).');
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
