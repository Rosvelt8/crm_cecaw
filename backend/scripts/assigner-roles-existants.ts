/**
 * Backfill ponctuel : affecte à chaque utilisateur existant le rôle RBAC précis (R01-R17)
 * correspondant à sa fonction réelle, au lieu de le laisser au repli du rôle historique
 * (admin/manager/backoffice/agent). Idempotent : remplace les affectations existantes.
 */
import prisma from '../src/lib/prisma';

/** Fonction telle qu'enregistrée en base → code du rôle RBAC réel. */
const PAR_FONCTION: Record<string, string> = {
  'Administrateur système': 'R01',
  'Responsable agence': 'R04',
  'Superviseur collecte': 'R12',
  'Caissier principal': 'R09',
  'Guichetière': 'R09',
  'Agent de collecte': 'R10',
  'Agent de proximité': 'R05',
  'Agent terrain': 'R05',
  'Commercial': 'R05',
  'Gestionnaire de credit classique': 'R05',
  'Gestionnaire prêt collecte': 'R05',
};

/** Repli si la fonction n'est pas reconnue : par rôle historique. */
const PAR_ROLE_HISTORIQUE: Record<string, string> = {
  admin: 'R01', manager: 'R04', backoffice: 'R09', agent: 'R05',
};

async function main() {
  const roles = await prisma.role.findMany({ select: { id: true, code: true } });
  const idParCode = new Map(roles.map((r) => [r.code, r.id]));

  const utilisateurs = await prisma.utilisateur.findMany({ select: { id: true, role: true, fonction: true, nom: true, prenom: true } });

  const parCode = new Map<string, number[]>();
  for (const u of utilisateurs) {
    const code = (u.fonction && PAR_FONCTION[u.fonction]) || PAR_ROLE_HISTORIQUE[u.role];
    if (!code || !idParCode.has(code)) {
      console.warn(`Aucun rôle RBAC déterminé pour #${u.id} ${u.prenom} ${u.nom} (rôle=${u.role}, fonction=${u.fonction ?? '—'})`);
      continue;
    }
    parCode.set(code, [...(parCode.get(code) ?? []), u.id]);
  }

  let total = 0;
  for (const [code, ids] of parCode) {
    const roleId = idParCode.get(code)!;
    await prisma.$transaction([
      prisma.utilisateurRole.deleteMany({ where: { utilisateurId: { in: ids }, roleId } }),
      prisma.utilisateurRole.createMany({ data: ids.map((utilisateurId) => ({ utilisateurId, roleId })) }),
    ]);
    console.log(`${code} → ${ids.length} utilisateur(s)`);
    total += ids.length;
  }
  console.log(`Total affecté : ${total}/${utilisateurs.length}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
