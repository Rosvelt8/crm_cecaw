import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from './prisma';

/**
 * Archivage réglementaire : instantané figé, horodaté et scellé d'un dossier.
 *
 * Chaque archive porte l'empreinte SHA-256 de son contenu. `verifier` la
 * recalcule : toute altération de la ligne en base est détectée. Une archive
 * n'est jamais modifiée ; archiver de nouveau crée la version suivante.
 */

export type EntiteArchivable = 'demande_credit' | 'dossier_kyc';

/** Sérialisation canonique : clés triées, pour que l'empreinte soit reproductible. */
export function serialiserCanonique(valeur: unknown): string {
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur);
  if (Array.isArray(valeur)) return `[${valeur.map(serialiserCanonique).join(',')}]`;
  const objet = valeur as Record<string, unknown>;
  const cles = Object.keys(objet).sort();
  return `{${cles.map((k) => `${JSON.stringify(k)}:${serialiserCanonique(objet[k])}`).join(',')}}`;
}

export function empreinte(contenu: unknown): string {
  return createHash('sha256').update(serialiserCanonique(contenu)).digest('hex');
}

/** Normalise Decimal et Date en valeurs JSON stables avant hachage. */
const normaliser = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

async function instantaneDemande(id: number) {
  const demande = await prisma.demandeCredit.findUniqueOrThrow({
    where: { id },
    include: {
      client: true,
      produit: { select: { id: true, nom: true, type: true } },
      parametrage: true,
      agence: { select: { id: true, nom: true } },
      dossierKyc: { include: { controles: true, piecesIdentite: true } },
      garanties: true,
      garants: true,
      visites: true,
      grille: { include: { bilan: true } },
      decisions: true,
      contrat: true,
      echeances: { orderBy: { numero: 'asc' } },
      remboursements: { orderBy: { datePaiement: 'asc' } },
      avenants: true,
      piecesJointes: { select: { id: true, intitule: true, nomFichier: true, typeMime: true, taille: true, version: true, categorie: true, url: true, createdAt: true } },
    },
  });
  const actes = await prisma.acteWorkflow.findMany({
    where: { entiteType: 'demande', entiteId: id },
    orderBy: { createdAt: 'asc' },
    include: { acteur: { select: { id: true, prenom: true, nom: true, email: true } } },
  });
  return { demande, actes, reference: demande.reference };
}

async function instantaneKyc(id: number) {
  const dossier = await prisma.dossierKyc.findUniqueOrThrow({
    where: { id },
    include: {
      client: true,
      prospect: true,
      controles: true,
      piecesIdentite: true,
      piecesJointes: { select: { id: true, intitule: true, nomFichier: true, typeMime: true, taille: true, version: true, categorie: true, url: true, createdAt: true } },
    },
  });
  const actes = await prisma.acteWorkflow.findMany({
    where: { entiteType: 'kyc', entiteId: id },
    orderBy: { createdAt: 'asc' },
    include: { acteur: { select: { id: true, prenom: true, nom: true, email: true } } },
  });
  return { dossier, actes, reference: dossier.reference };
}

export async function archiverEntite(
  type: EntiteArchivable,
  id: number,
  acteurId: number | null,
  motif?: string,
) {
  const brut = type === 'demande_credit' ? await instantaneDemande(id) : await instantaneKyc(id);
  const { reference, ...corps } = brut;
  const contenu = normaliser(corps) as Prisma.InputJsonValue;
  const hash = empreinte(contenu);

  // Deux archives concurrentes du même dossier se disputeraient le même
  // numéro de version : la contrainte d'unicité fait échouer la seconde, qui
  // relit alors la dernière version et réessaie.
  for (let tentative = 0; tentative < 3; tentative++) {
    const derniere = await prisma.archive.findFirst({
      where: { entiteType: type, entiteId: id },
      orderBy: { version: 'desc' },
      select: { version: true, hash: true },
    });
    // Rien n'a changé depuis la dernière archive : inutile d'empiler une copie identique.
    if (derniere && derniere.hash === hash) {
      return prisma.archive.findFirstOrThrow({
        where: { entiteType: type, entiteId: id, version: derniere.version },
      });
    }
    try {
      return await prisma.archive.create({
        data: {
          entiteType: type,
          entiteId: id,
          reference,
          version: (derniere?.version ?? 0) + 1,
          contenu,
          hash,
          motif: motif ?? null,
          archiveParId: acteurId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  throw new Error("Impossible d'archiver le dossier : conflit de version persistant.");
}

/** Recalcule l'empreinte d'une archive stockée et la compare à celle scellée. */
export async function verifierArchive(archiveId: number) {
  const a = await prisma.archive.findUniqueOrThrow({ where: { id: archiveId } });
  const recalcule = empreinte(a.contenu);
  return {
    id: a.id,
    reference: a.reference,
    version: a.version,
    hash_scelle: a.hash,
    hash_recalcule: recalcule,
    integre: recalcule === a.hash,
    archive_at: a.archiveAt,
  };
}

/**
 * Archivage automatique aux jalons du dossier. Il ne doit jamais faire échouer
 * l'opération métier qui l'a déclenché : l'échec est journalisé, pas propagé.
 */
export async function archiverSansBloquer(
  type: EntiteArchivable,
  id: number,
  acteurId: number | null,
  motif: string,
) {
  try {
    return await archiverEntite(type, id, acteurId, motif);
  } catch (e) {
    console.error(`[archivage] échec ${type}#${id} (${motif})`, e);
    return null;
  }
}
