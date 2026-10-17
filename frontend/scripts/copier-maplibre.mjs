// Copie le « worker » de MapLibre dans public/ pour qu'il soit servi par l'application elle-même.
// mapcn le charge par défaut depuis un CDN public (unpkg) : on évite cette dépendance externe au chargement des cartes.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(racine, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs');
if (!existsSync(source)) { console.warn('[maplibre] worker introuvable (maplibre-gl installé ?) : copie ignorée.'); process.exit(0); }
mkdirSync(join(racine, 'public'), { recursive: true });
copyFileSync(source, join(racine, 'public', 'maplibre-gl-worker.mjs'));
console.log('[maplibre] worker copié dans public/maplibre-gl-worker.mjs');
