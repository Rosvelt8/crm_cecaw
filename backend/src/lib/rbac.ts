import prisma from './prisma';
import { RoleUtilisateur } from '@prisma/client';
import {
  ROLES_REFERENTIEL,
  REGLES_SEPARATION,
  REPLI_ROLE_HISTORIQUE,
  catalogue,
} from './permissions';

/**
 * Droits effectifs d'un utilisateur = union des droits de ses rôles affectés.
 * À défaut d'affectation, le rôle historique de la table `utilisateurs` sert de repli.
 *
 * Le résultat est mis en cache quelques secondes : chaque requête protégée le
 * consulte, et une modification d'habilitation n'a pas à être instantanée. Le
 * cache est purgé explicitement quand l'administration change un rôle.
 */
const TTL_MS = 30_000;
const cache = new Map<number, { droits: Set<string>; jusqua: number }>();

export function viderCacheDroits(utilisateurId?: number) {
  if (utilisateurId === undefined) cache.clear();
  else cache.delete(utilisateurId);
}

async function droitsDesRoles(codes: string[]): Promise<string[]> {
  const roles = await prisma.role.findMany({
    where: { code: { in: codes }, actif: true },
    include: { permissions: { include: { permission: { select: { code: true } } } } },
  });
  return roles.flatMap((r) => r.permissions.map((p) => p.permission.code));
}

export async function droitsEffectifs(utilisateurId: number, roleHistorique: RoleUtilisateur): Promise<Set<string>> {
  const enCache = cache.get(utilisateurId);
  if (enCache && enCache.jusqua > Date.now()) return enCache.droits;

  let droits: Set<string>;

  const affectations = await prisma.utilisateurRole.findMany({
    where: { utilisateurId, role: { actif: true } },
    select: { role: { select: { code: true } } },
  });

  if (affectations.length > 0) {
    droits = new Set(await droitsDesRoles(affectations.map((a) => a.role.code)));
  } else {
    const repli = REPLI_ROLE_HISTORIQUE[roleHistorique];
    if (repli === '*') {
      droits = new Set(catalogue().map((p) => p.code));
    } else {
      // Base synchronisée : on lit la table ; sinon on retombe sur la matrice du code.
      const enBase = await droitsDesRoles(repli);
      droits = new Set(
        enBase.length > 0
          ? enBase
          : ROLES_REFERENTIEL.filter((r) => repli.includes(r.code)).flatMap((r) => r.droits),
      );
    }
  }

  cache.set(utilisateurId, { droits, jusqua: Date.now() + TTL_MS });
  return droits;
}

export async function codesRoles(utilisateurId: number): Promise<string[]> {
  const rows = await prisma.utilisateurRole.findMany({
    where: { utilisateurId },
    select: { role: { select: { code: true } } },
  });
  return rows.map((r) => r.role.code);
}

/**
 * Codes de rôles réellement exercés : les affectations explicites, ou à défaut
 * le repli du rôle historique. Un administrateur historique sans affectation
 * exerce tous les rôles, afin de ne pas verrouiller l'installation existante.
 */
export async function rolesEffectifs(utilisateurId: number, roleHistorique: RoleUtilisateur): Promise<Set<string>> {
  const affectes = await codesRoles(utilisateurId);
  if (affectes.length > 0) return new Set(affectes);
  const repli = REPLI_ROLE_HISTORIQUE[roleHistorique];
  return new Set(repli === '*' ? ROLES_REFERENTIEL.map((r) => r.code) : repli);
}

/** Erreur métier portant un statut HTTP, comprise par `errorHandler`. */
export class ErreurMetier extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/**
 * Consigne le franchissement d'une étape de workflow.
 * À appeler dans la même transaction que le changement d'état qu'il accompagne.
 */
export async function consignerActe(
  entiteType: string,
  entiteId: number,
  etape: string,
  acteurId: number,
  commentaire?: string,
  tx: Pick<typeof prisma, 'acteWorkflow'> = prisma,
) {
  await tx.acteWorkflow.create({
    data: { entiteType, entiteId, etape, acteurId, commentaire: commentaire ?? null },
  });
}

/**
 * Applique les règles de séparation des fonctions (TR-03) avant qu'un acteur
 * franchisse `etape` sur une entité. Une règle interdit l'étape B à qui a déjà
 * exécuté l'étape A sur la même entité ; elle joue dans les deux sens, si bien
 * qu'on ne peut pas non plus exécuter A après B.
 *
 * Le contrôle repose sur la trace `ActeWorkflow`, pas sur l'interface : il ne
 * peut donc pas être contourné en appelant l'API directement.
 */
export async function verifierSeparation(
  entiteType: string,
  entiteId: number,
  etape: string,
  acteurId: number,
) {
  const regles = await prisma.regleSeparation.findMany({
    where: { actif: true, OR: [{ etapeA: etape }, { etapeB: etape }] },
  });
  if (regles.length === 0) return;

  for (const regle of regles) {
    const etapeOpposee = regle.etapeA === etape ? regle.etapeB : regle.etapeA;
    const conflit = await prisma.acteWorkflow.findFirst({
      where: { entiteType, entiteId, etape: etapeOpposee, acteurId },
      select: { id: true },
    });
    if (conflit) {
      throw new ErreurMetier(
        regle.message ?? `Séparation des fonctions : ${regle.libelle}`,
        403,
      );
    }
  }
}

/**
 * Crée ou met à jour catalogue, rôles, habilitations et règles de séparation.
 *
 * Les habilitations d'un rôle ne sont écrasées qu'à sa création : un
 * administrateur qui a ajusté un rôle ne doit pas voir ses choix annulés à
 * chaque redémarrage. Seuls les droits absents du catalogue sont ajoutés.
 */
export async function synchroniserReferentiel() {
  const permissions = catalogue();
  const dejaConnus = new Set((await prisma.permission.findMany({ select: { code: true } })).map((p) => p.code));
  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: p,
      update: { libelle: p.libelle },
    });
  }
  const idParCode = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );

  for (const r of ROLES_REFERENTIEL) {
    const existant = await prisma.role.findUnique({ where: { code: r.code }, select: { id: true } });
    const role = existant
      ? existant
      : await prisma.role.create({
          data: { code: r.code, nom: r.nom, description: r.description, systeme: true },
          select: { id: true },
        });

    // Rôle neuf : tous ses droits. Rôle existant : seulement les droits apparus dans le catalogue
    // depuis la dernière synchronisation, pour ne pas rétablir ce qu'un administrateur a retiré.
    const aAccorder = existant ? r.droits.filter((code) => !dejaConnus.has(code)) : r.droits;
    if (aAccorder.length > 0) {
      const data = aAccorder
        .map((code) => idParCode.get(code))
        .filter((id): id is number => id !== undefined)
        .map((permissionId) => ({ roleId: role.id, permissionId }));
      await prisma.rolePermission.createMany({ data, skipDuplicates: true });
    }
  }

  for (const regle of REGLES_SEPARATION) {
    await prisma.regleSeparation.upsert({
      where: { code: regle.code },
      create: regle,
      update: {},
    });
  }

  // Rattrapage des produits antérieurs à la colonne `type` : on les classe d'après
  // leur groupe. Ne touche que ceux encore à « autre », donc jamais un choix explicite.
  await prisma.produit.updateMany({ where: { type: 'autre', groupe: { nom: { contains: 'Crédit', mode: 'insensitive' } } }, data: { type: 'credit' } });
  await prisma.produit.updateMany({ where: { type: 'autre', groupe: { nom: { contains: 'pargne', mode: 'insensitive' } } }, data: { type: 'epargne' } });

  viderCacheDroits();
}
