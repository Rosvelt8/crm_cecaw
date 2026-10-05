import fs from 'fs';
import path from 'path';
import { ROLES_REFERENTIEL, DOMAINES, catalogue } from '../src/lib/permissions';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = walk(path.join(__dirname, '../src/modules'));
const reel = new Set<string>();
const re = /can\(([^)]*)\)/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const code of m[1].matchAll(/'([a-z]+:[A-Z]+)'/g)) reel.add(code[1]);
  }
}

const roles = new Set(ROLES_REFERENTIEL.flatMap((r) => r.droits));
const domaines = new Set(Object.keys(DOMAINES));

console.log('=== Codes réellement exigés par au moins une route (', reel.size, ') ===');
console.log([...reel].sort().join('\n'));

console.log('\n=== Codes accordés à un rôle mais JAMAIS exigés par aucune route (', [...roles].filter((c) => !reel.has(c)).length, ') ===');
console.log([...roles].filter((c) => !reel.has(c)).sort().join('\n'));

console.log('\n=== Codes exigés par une route mais absents de tout rôle (', [...reel].filter((c) => !roles.has(c)).length, ') ===');
console.log([...reel].filter((c) => !roles.has(c)).sort().join('\n'));

const domainesUtilises = new Set([...reel, ...roles].map((c) => c.split(':')[0]));
console.log('\n=== Domaines déclarés jamais utilisés (', [...domaines].filter((d) => !domainesUtilises.has(d)).length, ') ===');
console.log([...domaines].filter((d) => !domainesUtilises.has(d)).join('\n'));

const cat = new Set(catalogue().map((p) => p.code));
console.log('\n=== Catalogue (', cat.size, ') ===');
console.log('\n=== Droits de rôle absents du catalogue → seraient perdus au démarrage (', [...roles].filter((c) => !cat.has(c)).length, ') ===');
console.log([...roles].filter((c) => !cat.has(c)).sort().join('\n'));
console.log('\n=== Codes exigés par une route mais absents du catalogue → 403 systématique (', [...reel].filter((c) => !cat.has(c)).length, ') ===');
console.log([...reel].filter((c) => !cat.has(c)).sort().join('\n'));
console.log('\n=== Catalogue jamais accordé à aucun rôle (bruit résiduel) (', [...cat].filter((c) => !roles.has(c) && !reel.has(c)).length, ') ===');
console.log([...cat].filter((c) => !roles.has(c) && !reel.has(c)).sort().join('\n'));
