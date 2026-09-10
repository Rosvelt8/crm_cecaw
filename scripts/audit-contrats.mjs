#!/usr/bin/env node
/**
 * Audit des contrats entre le backend et ses clients (web et mobile).
 *
 * Deux familles d'erreurs reviennent sans cesse dans ce projet, parce que rien
 * ne les detecte a la compilation : les charges sont typees `Record<string,
 * unknown>` cote client, et Zod ignore silencieusement les cles inconnues.
 *
 *  1. Une cle envoyee en camelCase alors que le schema Zod attend du
 *     snake_case. Le champ est ignore, ou l'appel echoue sur un « Required »
 *     portant sur un champ que le developpeur croit avoir envoye.
 *  2. Un appel vers une route qui n'existe pas cote serveur, qui repond 404
 *     sans que personne ne s'en apercoive tant que la fonction n'est pas testee.
 *
 * Usage : node scripts/audit-contrats.mjs
 * Sortie : code 1 si au moins une anomalie est trouvee, pour un usage en CI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Cles internes aux clients, jamais transmises telles quelles au serveur. */
const TOLEREES = new Set(['agentId', 'compteId']);

/**
 * Fonctionnalites appelees cote client mais absentes du backend.
 *
 * Ce ne sont pas des fautes de frappe : le modele Prisma `piecesJointes`
 * existe, mais aucune route ne l'expose, et l'export de reporting n'a jamais
 * ete implemente. Elles sont listees ici pour que l'audit reste exploitable en
 * integration continue, tout en gardant la lacune visible.
 */
const LACUNES_CONNUES = new Set([
  'POST /clients/:x/pj',
  'DELETE /clients/:x/pj/:x',
  'POST /prospects/:x/pj',
  'DELETE /prospects/:x/pj/:x',
  'POST /reporting/exporter',
]);

function fichiers(dossier, ext = ['.ts', '.tsx']) {
  const out = [];
  const parcourir = (d) => {
    let entrees;
    try {
      entrees = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entrees) {
      if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) parcourir(p);
      else if (ext.some((x) => p.endsWith(x))) out.push(p);
    }
  };
  parcourir(dossier);
  return out;
}

const lire = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(RACINE, p).replace(/\\/g, '/');

// ── 1. Champs attendus par les schemas Zod ──────────────────────────────────
const champsAttendus = new Map(); // camelCase -> Set("module.snake_case")

for (const p of fichiers(join(RACINE, 'backend/src/modules'))) {
  if (!p.endsWith('.controller.ts')) continue;
  const module = basename(dirname(p));
  const src = lire(p);
  for (const bloc of src.matchAll(/z\.object\(\{([\s\S]*?)\n\}\)/g)) {
    for (const ligne of bloc[1].split('\n')) {
      const m = /^\s*(\w+)\s*:/.exec(ligne);
      if (!m || !m[1].includes('_')) continue;
      const snake = m[1];
      const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (!champsAttendus.has(camel)) champsAttendus.set(camel, new Set());
      champsAttendus.get(camel).add(`${module}.${snake}`);
    }
  }
}

// ── 2. Routes exposees par le backend ───────────────────────────────────────
const indexRoutes = lire(join(RACINE, 'backend/src/routes/index.ts'));
const prefixes = new Map(); // variable -> prefixe
for (const m of indexRoutes.matchAll(/router\.use\('(\/[^']+)',\s*(\w+)/g)) {
  prefixes.set(m[2], m[1]);
}
const modules = new Map(); // variable -> module
for (const m of indexRoutes.matchAll(/import (\w+) from '\.\.\/modules\/([\w-]+)\//g)) {
  modules.set(m[1], m[2]);
}

const normaliser = (chemin) =>
  chemin
    .replace(/\$\{[^}]+\}/g, ':x')
    .replace(/\/:[\w]+/g, '/:x')
    .replace(/\/+$/, '') || '/';

const routes = new Set();
for (const [variable, prefixe] of prefixes) {
  const module = modules.get(variable);
  if (!module) continue;
  // Le fichier de routes ne porte pas toujours le nom du dossier
  // (« groupes-produits/groupes.routes.ts ») : on le cherche au lieu de le deviner.
  const dossier = join(RACINE, 'backend/src/modules', module);
  const fichierRoutes = fichiers(dossier).find((f) => f.endsWith('.routes.ts'));
  if (!fichierRoutes) continue;
  const src = lire(fichierRoutes);
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\('([^']*)'/g)) {
    routes.add(`${m[1].toUpperCase()} ${normaliser(prefixe + m[2])}`);
  }
}

// ── 3. Analyse des clients ──────────────────────────────────────────────────
const APPEL_ECRITURE = /\.(?:post|put|patch)\(|\.create\(|\.update\(|create[A-Z]\w*\(|update[A-Z]\w*\(/g;
const anomalies = [];

for (const racine of ['frontend/src', 'mobile/src', 'mobile/app']) {
  for (const p of fichiers(join(RACINE, racine))) {
    const src = lire(p);
    const lignes = src.split('\n');

    // 3a. Routes inexistantes.
    for (const m of src.matchAll(
      /api(?:Client)?\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g,
    )) {
      const chemin = m[2];
      if (!chemin.startsWith('/')) continue;
      const cle = `${m[1].toUpperCase()} ${normaliser(chemin)}`;
      if (!routes.has(cle)) {
        anomalies.push({
          type: LACUNES_CONNUES.has(cle) ? 'lacune' : 'route',
          fichier: rel(p),
          ligne: src.slice(0, m.index).split('\n').length,
          detail: `${m[1].toUpperCase()} ${chemin} n'existe pas cote backend`,
        });
      }
    }

    // 3b. Cles camelCase dans une charge d'ecriture.
    for (const m of src.matchAll(APPEL_ECRITURE)) {
      const debut = src.slice(0, m.index).split('\n').length - 1;
      const bloc = lignes.slice(debut, debut + 18).join('\n');
      for (const k of bloc.matchAll(/^\s{2,}([a-z][a-zA-Z0-9]*)\s*:/gm)) {
        const cle = k[1];
        if (TOLEREES.has(cle) || !champsAttendus.has(cle)) continue;
        anomalies.push({
          type: 'champ',
          fichier: rel(p),
          ligne: debut + 1,
          detail: `« ${cle} » envoye, le backend attend « ${[...champsAttendus.get(cle)].join(', ')} »`,
        });
      }
    }
  }
}

// ── 4. Restitution ──────────────────────────────────────────────────────────
console.log(`${routes.size} routes backend, ${champsAttendus.size} champs snake_case attendus\n`);

const uniques = [...new Map(anomalies.map((a) => [`${a.fichier}${a.ligne}${a.detail}`, a])).values()];

if (uniques.length === 0) {
  console.log('Aucune anomalie de contrat detectee.');
  process.exit(0);
}

const TITRES = {
  route: 'Routes inexistantes :',
  champ: 'Cles mal nommees :',
  lacune: 'Lacunes connues, non bloquantes :',
};

for (const groupe of ['route', 'champ', 'lacune']) {
  const lot = uniques.filter((a) => a.type === groupe);
  if (lot.length === 0) continue;
  console.log(`${TITRES[groupe]}
`);
  for (const a of lot) console.log(`  ${a.fichier}:${a.ligne}
     ${a.detail}`);
  console.log('');
}

// Seules les vraies anomalies font echouer l'audit ; les lacunes connues sont
// rappelees pour memoire, sans bloquer une chaine d'integration.
const bloquantes = uniques.filter((a) => a.type !== 'lacune');
const lacunes = uniques.length - bloquantes.length;
console.log(
  bloquantes.length === 0
    ? `Aucune anomalie bloquante. ${lacunes} lacune(s) connue(s).`
    : `${bloquantes.length} anomalie(s) bloquante(s), ${lacunes} lacune(s) connue(s).`,
);
process.exit(bloquantes.length === 0 ? 0 : 1);
