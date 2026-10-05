import prisma from '../src/lib/prisma';
import { ROLES_REFERENTIEL } from '../src/lib/permissions';

async function main() {
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: { select: { code: true } } } } },
  });
  const enBase = new Map(roles.map((r) => [r.code, new Set(r.permissions.map((p) => p.permission.code))]));

  let ecarts = 0;
  for (const def of ROLES_REFERENTIEL) {
    const attendu = new Set(def.droits);
    const reel = enBase.get(def.code) ?? new Set<string>();
    const manquants = [...attendu].filter((c) => !reel.has(c));
    const surplus = [...reel].filter((c) => !attendu.has(c));
    if (manquants.length || surplus.length) {
      ecarts++;
      console.log(`${def.code} : ${manquants.length} manquant(s) [${manquants.join(', ')}] | ${surplus.length} en trop [${surplus.join(', ')}]`);
    }
  }
  console.log(ecarts === 0 ? 'Tous les rôles correspondent exactement au référentiel.' : `${ecarts} rôle(s) en écart.`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
