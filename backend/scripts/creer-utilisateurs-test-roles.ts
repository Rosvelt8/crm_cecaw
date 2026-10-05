/**
 * Provisionne un compte de test par rôle RBAC (R01-R15, R17), pour valider chaque périmètre
 * d'habilitation isolément. Organisation retenue :
 *   - Agence Dakar (siège) : rôles nationaux/direction sans ancrage agence (R01, R02, R03, R14, R15).
 *   - Agence Congo (agence pilote) : rôles d'agence et de terrain (R04-R13, R17), chacun rattaché
 *     à l'équipe la plus proche de sa fonction quand le rôle relève d'une équipe précise ; les
 *     rôles transverses à l'agence (responsable, comité, superviseur, SIG) n'ont pas d'équipe.
 * Idempotent : rejouable sans dupliquer (upsert par email).
 */
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';
import { ROLES_REFERENTIEL } from '../src/lib/permissions';
import { RoleUtilisateur } from '@prisma/client';

const SIEGE = 1;   // Agence Dakar
const PILOTE = 2;  // Agence Congo
const EQUIPE_CREDIT_CLASSIQUE = 5;     // Équipe Crédit Classique Congo
const EQUIPE_CREDIT_COLLECTE = 6;      // Équipe Crédit Collecte Congo
const EQUIPE_COMMERCIALE_COLLECTE = 7; // Équipe Commerciale Collecte Congo
const EQUIPE_BUREAU_DIRECT = 8;        // Équipe Bureau Direct Congo

interface Affectation { agenceId: number; equipeId: number | null; legacy: RoleUtilisateur; }

const AFFECTATIONS: Record<string, Affectation> = {
  R01: { agenceId: SIEGE, equipeId: null, legacy: 'admin' },
  R02: { agenceId: SIEGE, equipeId: null, legacy: 'admin' },
  R03: { agenceId: SIEGE, equipeId: null, legacy: 'manager' },
  R04: { agenceId: PILOTE, equipeId: null, legacy: 'manager' },
  R05: { agenceId: PILOTE, equipeId: EQUIPE_COMMERCIALE_COLLECTE, legacy: 'agent' },
  R06: { agenceId: PILOTE, equipeId: EQUIPE_BUREAU_DIRECT, legacy: 'backoffice' },
  R07: { agenceId: PILOTE, equipeId: EQUIPE_CREDIT_CLASSIQUE, legacy: 'backoffice' },
  R08: { agenceId: PILOTE, equipeId: null, legacy: 'manager' },
  R09: { agenceId: PILOTE, equipeId: EQUIPE_BUREAU_DIRECT, legacy: 'backoffice' },
  R10: { agenceId: PILOTE, equipeId: EQUIPE_CREDIT_COLLECTE, legacy: 'agent' },
  R11: { agenceId: PILOTE, equipeId: EQUIPE_CREDIT_COLLECTE, legacy: 'agent' },
  R12: { agenceId: PILOTE, equipeId: null, legacy: 'backoffice' },
  R13: { agenceId: PILOTE, equipeId: null, legacy: 'manager' },
  R14: { agenceId: SIEGE, equipeId: null, legacy: 'backoffice' },
  R15: { agenceId: SIEGE, equipeId: null, legacy: 'manager' },
  R17: { agenceId: PILOTE, equipeId: EQUIPE_BUREAU_DIRECT, legacy: 'agent' },
};

async function main() {
  const roles = await prisma.role.findMany({ where: { actif: true }, select: { id: true, code: true } });
  const roleIdParCode = new Map(roles.map((r) => [r.code, r.id]));
  const hash = await bcrypt.hash(env.DEFAULT_PASSWORD, 10);

  const resume: { code: string; email: string; agence: number; equipe: number | null }[] = [];

  for (const def of ROLES_REFERENTIEL) {
    const aff = AFFECTATIONS[def.code];
    const roleId = roleIdParCode.get(def.code);
    if (!aff || !roleId) { console.warn(`Rôle ${def.code} sans affectation ou introuvable en base, ignoré`); continue; }

    const email = `test.${def.code.toLowerCase()}@cecaw.cm`;
    const u = await prisma.utilisateur.upsert({
      where: { email },
      create: {
        nom: def.code, prenom: 'Test', email, password: hash,
        role: aff.legacy, fonction: def.nom, agenceId: aff.agenceId, equipeId: aff.equipeId ?? undefined,
        actif: true,
      },
      update: {
        role: aff.legacy, fonction: def.nom, agenceId: aff.agenceId, equipeId: aff.equipeId,
        actif: true,
      },
    });

    await prisma.$transaction([
      prisma.utilisateurRole.deleteMany({ where: { utilisateurId: u.id } }),
      prisma.utilisateurRole.create({ data: { utilisateurId: u.id, roleId } }),
    ]);

    resume.push({ code: def.code, email, agence: aff.agenceId, equipe: aff.equipeId });
  }

  console.log(`${resume.length} compte(s) de test provisionné(s) (mot de passe : ${env.DEFAULT_PASSWORD})`);
  for (const r of resume) console.log(`  ${r.code} → ${r.email} | agence #${r.agence}${r.equipe ? ` | équipe #${r.equipe}` : ''}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
