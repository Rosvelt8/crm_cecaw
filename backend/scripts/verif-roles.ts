import { catalogue, ROLES_REFERENTIEL } from '../src/lib/permissions';
const cat = new Set(catalogue().map((p) => p.code));
const hors = ROLES_REFERENTIEL.flatMap((r) => r.droits.filter((d) => !cat.has(d)).map((d) => `${r.code}:${d}`));
console.log('roles', ROLES_REFERENTIEL.length, '| catalogue', cat.size, '| droits hors catalogue', hors);
// Contrôle du principe de séparation : aucun rôle ne cumule montage/analyse et décision sans le vouloir.
for (const r of ROLES_REFERENTIEL) {
  const s = new Set(r.droits);
  const decide = s.has('credit:APPROVE');
  const analyse = s.has('analyse:CREATE');
  const monte = s.has('credit:CREATE');
  if (decide && (analyse || monte)) console.log(`  ${r.code} cumule décision et ${analyse ? 'analyse' : ''}${monte ? ' montage' : ''} (couvert par les règles de séparation au niveau du dossier)`);
}
