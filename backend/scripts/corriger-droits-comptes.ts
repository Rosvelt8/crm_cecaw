/** Applique les droits comptes:VIEW/EXPORT ajoutés à R04, R14, R15 dans permissions.ts (corrige
 *  l'orphelin comptes:EXPORT détecté par audit-permissions.ts), non propagés automatiquement par
 *  synchroniserReferentiel() car ce ne sont pas de nouveaux codes de catalogue. */
import prisma from '../src/lib/prisma';

const AJOUTS: Record<string, string[]> = {
  R04: ['comptes:EXPORT'],
  R14: ['comptes:VIEW', 'comptes:EXPORT'],
  R15: ['comptes:EXPORT'],
};

async function main() {
  for (const [roleCode, codes] of Object.entries(AJOUTS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    const perms = await prisma.permission.findMany({ where: { code: { in: codes } } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    console.log(`${roleCode} : +${perms.length} (${codes.join(', ')})`);
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
