import prisma from '../../lib/prisma';
import { Prisma, NiveauRisque, ResultatControle, TypePieceIdentite } from '@prisma/client';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { ErreurMetier, consignerActe, verifierSeparation, rolesEffectifs } from '../../lib/rbac';
import { archiverSansBloquer } from '../../lib/archivage';
import { debloquerDemandesEnAttenteKyc } from '../credit/credit.service';
import { emettre } from '../../lib/notifier';
import { alerter, rechercherSurveillance } from '../../lib/conformite';

/** Contrôles standard créés avec chaque dossier (KYC 16). */
export const CONTROLES_STANDARD = [
  { code: 'identite_conforme', libelle: "Pièce d'identité lisible, valide et conforme au déclaré" },
  { code: 'adresse_verifiee', libelle: "Adresse du domicile vérifiée (justificatif ou visite)" },
  { code: 'activite_verifiee', libelle: "Existence et localisation de l'activité professionnelle vérifiées" },
  { code: 'revenus_justifies', libelle: 'Revenus déclarés cohérents avec les justificatifs' },
  { code: 'origine_fonds', libelle: "Origine des fonds documentée (LCB-FT)" },
  { code: 'listes_surveillance', libelle: 'Recherche sur les listes de surveillance et personnes politiquement exposées' },
  { code: 'homonymie', libelle: "Absence de doublon ou d'homonymie dans la base clients" },
];

const ROLES_GLOBAUX = ['R03', 'R06', 'R15'];

async function perimetre(actor: JwtPayload): Promise<Prisma.DossierKycWhereInput> {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (ROLES_GLOBAUX.some((r) => roles.has(r))) return {};
  if (roles.has('R04') || roles.has('R07') || roles.has('R08')) {
    return actor.agenceId
      ? { OR: [{ client: { agenceId: actor.agenceId } }, { prospect: { commercial: { agenceId: actor.agenceId } } }] }
      : { id: -1 };
  }
  return { creeParId: actor.sub };
}

const inclure = {
  client: { select: { id: true, nom: true, prenom: true, typePersonne: true, telephone: true } },
  prospect: { select: { id: true, nom: true, prenom: true, typePersonne: true, telephone: true } },
  creePar: { select: { id: true, prenom: true, nom: true } },
  validePar: { select: { id: true, prenom: true, nom: true } },
} as const;

async function dossierVisible(actor: JwtPayload, id: number) {
  const d = await prisma.dossierKyc.findFirst({ where: { id, ...(await perimetre(actor)) } });
  if (!d) throw new ErreurMetier('Dossier KYC introuvable', 404);
  return d;
}

async function prochaineReference(): Promise<string> {
  const annee = new Date().getFullYear();
  const motif = `KYC-${annee}-`;
  const derniere = await prisma.dossierKyc.findFirst({
    where: { reference: { startsWith: motif } }, orderBy: { reference: 'desc' }, select: { reference: true },
  });
  const seq = derniere ? parseInt(derniere.reference.split('-')[2], 10) + 1 : 1;
  return `${motif}${String(seq).padStart(5, '0')}`;
}

export async function lister(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Prisma.DossierKycWhereInput = { ...(await perimetre(actor)) };
  if (query.statut) where.statut = query.statut as never;
  if (query.client_id) where.clientId = parseInt(String(query.client_id), 10);
  if (query.niveau_risque) where.niveauRisque = query.niveau_risque as NiveauRisque;
  const [items, total] = await Promise.all([
    prisma.dossierKyc.findMany({ where, include: inclure, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.dossierKyc.count({ where }),
  ]);
  return { items, meta: paginationMeta(page, perPage, total) };
}

export async function obtenir(actor: JwtPayload, id: number) {
  await dossierVisible(actor, id);
  const [dossier, actes] = await Promise.all([
    prisma.dossierKyc.findUniqueOrThrow({
      where: { id },
      include: {
        ...inclure,
        controles: { orderBy: { id: 'asc' }, include: { controlePar: { select: { id: true, prenom: true, nom: true } } } },
        piecesIdentite: { include: { pieceJointe: true }, orderBy: { createdAt: 'desc' } },
        piecesJointes: { where: { archiveAt: null }, orderBy: { createdAt: 'desc' } },
      },
    }),
    prisma.acteWorkflow.findMany({
      where: { entiteType: 'kyc', entiteId: id },
      orderBy: { createdAt: 'asc' },
      include: { acteur: { select: { id: true, prenom: true, nom: true } } },
    }),
  ]);
  return { ...dossier, actes };
}

export async function creer(actor: JwtPayload, c: { client_id?: number; prospect_id?: number }) {
  if (!c.client_id && !c.prospect_id) throw new ErreurMetier('Un client ou un prospect est requis.', 422);
  if (c.client_id && c.prospect_id) throw new ErreurMetier('Indiquez un client ou un prospect, pas les deux.', 422);

  // Un seul dossier ouvert à la fois par personne : évite les KYC concurrents contradictoires.
  const ouvert = await prisma.dossierKyc.findFirst({
    where: {
      clientId: c.client_id ?? undefined, prospectId: c.prospect_id ?? undefined,
      statut: { in: ['brouillon', 'en_controle'] },
    },
    select: { reference: true },
  });
  if (ouvert) throw new ErreurMetier(`Un dossier KYC est déjà ouvert pour cette personne (${ouvert.reference}).`, 409);

  const reference = await prochaineReference();
  const dossier = await prisma.$transaction(async (tx) => {
    const d = await tx.dossierKyc.create({
      data: {
        reference, clientId: c.client_id ?? null, prospectId: c.prospect_id ?? null, creeParId: actor.sub,
        controles: { create: CONTROLES_STANDARD },
      },
    });
    await consignerActe('kyc', d.id, 'kyc_creation', actor.sub, undefined, tx);
    return d;
  });
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'kyc', action: 'CREATE_KYC', entiteType: 'dossier_kyc', entiteId: dossier.id, description: `Ouverture du dossier ${reference}`, impact: '+1 dossier KYC',
  });
  return dossier;
}

export async function evaluerControle(actor: JwtPayload, id: number, controleId: number, c: { resultat: ResultatControle; commentaire?: string }) {
  const d = await dossierVisible(actor, id);
  if (d.statut !== 'en_controle') throw new ErreurMetier('Les contrôles ne sont évaluables que sur un dossier en cours de contrôle.', 409);
  if (c.resultat === 'non_conforme' && !c.commentaire?.trim()) throw new ErreurMetier('Un commentaire est obligatoire pour une non-conformité.', 422);
  const r = await prisma.controleKyc.updateMany({
    where: { id: controleId, dossierId: id },
    data: { resultat: c.resultat, commentaire: c.commentaire ?? null, controleParId: actor.sub },
  });
  if (r.count === 0) throw new ErreurMetier('Contrôle introuvable', 404);
  return prisma.controleKyc.findUniqueOrThrow({ where: { id: controleId } });
}

export async function ajouterPieceIdentite(
  actor: JwtPayload, id: number,
  c: { type: TypePieceIdentite; numero: string; autorite_delivrance?: string; date_delivrance?: string; date_expiration?: string },
  fichier?: Express.Multer.File,
) {
  const d = await dossierVisible(actor, id);
  if (!['brouillon', 'en_controle'].includes(d.statut)) throw new ErreurMetier('Le dossier est figé.', 409);

  return prisma.$transaction(async (tx) => {
    let pieceJointeId: number | null = null;
    if (fichier) {
      const pj = await tx.pieceJointe.create({
        data: {
          intitule: `Pièce d'identité ${c.type}`, nomFichier: fichier.originalname, typeMime: fichier.mimetype, taille: fichier.size,
          url: `/uploads/${fichier.filename}`, categorie: 'piece_identite', dossierKycId: id,
        },
      });
      pieceJointeId = pj.id;
    }
    return tx.pieceIdentite.create({
      data: {
        dossierId: id, type: c.type, numero: c.numero, autoriteDelivrance: c.autorite_delivrance ?? null,
        dateDelivrance: c.date_delivrance ? new Date(c.date_delivrance) : null,
        dateExpiration: c.date_expiration ? new Date(c.date_expiration) : null, pieceJointeId,
      },
    });
  });
}

export async function joindreDocument(actor: JwtPayload, id: number, fichier: Express.Multer.File, intitule?: string, categorie?: string) {
  const d = await dossierVisible(actor, id);
  if (!['brouillon', 'en_controle'].includes(d.statut)) throw new ErreurMetier('Le dossier est figé.', 409);

  // Versioning (TR-05) : un document de même intitulé remplace le précédent sans le détruire.
  const titre = intitule ?? fichier.originalname;
  const precedent = await prisma.pieceJointe.findFirst({
    where: { dossierKycId: id, intitule: titre, archiveAt: null },
    orderBy: { version: 'desc' },
  });
  return prisma.$transaction(async (tx) => {
    if (precedent) await tx.pieceJointe.update({ where: { id: precedent.id }, data: { archiveAt: new Date() } });
    return tx.pieceJointe.create({
      data: {
        intitule: titre, nomFichier: fichier.originalname, typeMime: fichier.mimetype, taille: fichier.size,
        url: `/uploads/${fichier.filename}`, categorie: categorie ?? 'justificatif', dossierKycId: id,
        version: (precedent?.version ?? 0) + 1, remplaceId: precedent?.id ?? null,
      },
    });
  });
}

export async function soumettre(actor: JwtPayload, id: number) {
  const d = await dossierVisible(actor, id);
  if (d.statut !== 'brouillon') throw new ErreurMetier('Ce dossier a déjà été soumis.', 409);
  const nbPieces = await prisma.pieceIdentite.count({ where: { dossierId: id } });
  if (nbPieces === 0) throw new ErreurMetier("Au moins une pièce d'identité est requise avant la soumission.", 422);

  await prisma.$transaction(async (tx) => {
    await tx.dossierKyc.update({ where: { id }, data: { statut: 'en_controle' } });
    await consignerActe('kyc', id, 'kyc_soumission', actor.sub, undefined, tx);
  });
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'kyc', action: 'SUBMIT_KYC', entiteType: 'dossier_kyc', entiteId: id, description: `Soumission du dossier ${d.reference}`,
  });

  // Filtrage automatique sur les listes de surveillance (LCB-FT) : le résultat renseigne le contrôle dédié.
  const full = await prisma.dossierKyc.findUnique({ where: { id }, include: { client: true, prospect: true, piecesIdentite: true, controles: true } });
  const personne = full?.client ?? full?.prospect;
  let correspondances = 0;
  if (full && personne) {
    const hits = await rechercherSurveillance({ nom: personne.nom, prenom: personne.prenom, numeroPiece: full.piecesIdentite[0]?.numero ?? personne.numeroCni });
    correspondances = hits.length;
    const ctl = full.controles.find((c) => c.code === 'listes_surveillance');
    if (ctl) {
      await prisma.controleKyc.update({
        where: { id: ctl.id },
        data: hits.length === 0
          ? { resultat: 'conforme', commentaire: 'Aucune correspondance sur les listes de surveillance (contrôle automatique).' }
          : { commentaire: `À examiner : ${hits.map((h) => `${h.nom} (${h.categorie}, ${Math.round(h.score * 100)} %)`).join(' ; ')}` },
      });
    }
    if (hits.length > 0) {
      await alerter({
        code: 'surveillance_kyc', niveau: hits.some((h) => h.categorie === 'sanction') ? 'critique' : 'eleve',
        titre: `Correspondance sur liste de surveillance : ${personne.nom}`, description: hits.map((h) => `${h.nom} — ${h.categorie}${h.motif ? ` (${h.motif})` : ''}`).join(' ; '),
        empreinte: `kycsurv:${id}`, entiteType: 'dossier_kyc', entiteId: id, agenceId: actor.agenceId,
      });
    }
  }
  void emettre('kyc.a_valider', { entiteType: 'dossier_kyc', entiteId: id, agenceId: actor.agenceId, acteurId: actor.sub, donnees: { reference: d.reference, personne: personne ? `${personne.prenom ?? ''} ${personne.nom}`.trim() : '', correspondances, lien: `/dashboard/kyc/${id}` } });
  return { statut: 'en_controle', correspondances_surveillance: correspondances };
}

/**
 * Niveau de risque LCB-FT à règles. Indicatif : l'agent conformité peut le
 * relever mais l'algorithme ne décide pas à sa place. Barème de départ à
 * valider par la conformité.
 */
export function evaluerRisque(p: {
  nonConformes: number;
  pieceExpiree: boolean;
  personneMorale: boolean;
  nationaliteEtrangere: boolean;
  sansGeolocalisation: boolean;
  revenusMensuels: number;
  correspondanceSurveillance?: boolean;
}): { score: number; niveau: NiveauRisque; facteurs: string[] } {
  let score = 10;
  const facteurs: string[] = [];
  const ajouter = (points: number, texte: string) => { score += points; facteurs.push(`${texte} (+${points})`); };
  if (p.correspondanceSurveillance) ajouter(40, 'Correspondance sur une liste de surveillance');
  if (p.nonConformes > 0) ajouter(Math.min(60, p.nonConformes * 20), `${p.nonConformes} contrôle(s) non conforme(s)`);
  if (p.pieceExpiree) ajouter(25, "Pièce d'identité expirée");
  if (p.personneMorale) ajouter(10, 'Personne morale');
  if (p.nationaliteEtrangere) ajouter(10, 'Nationalité étrangère');
  if (p.sansGeolocalisation) ajouter(5, 'Domicile non géolocalisé');
  if (p.revenusMensuels > 5_000_000) ajouter(10, 'Revenus mensuels supérieurs à 5 000 000');
  score = Math.min(100, score);
  const niveau: NiveauRisque = score < 30 ? 'faible' : score < 60 ? 'moyen' : 'eleve';
  return { score, niveau, facteurs };
}

export async function valider(actor: JwtPayload, id: number, niveauForce?: NiveauRisque) {
  const d = await dossierVisible(actor, id);
  if (d.statut !== 'en_controle') throw new ErreurMetier("Ce dossier n'est pas en cours de contrôle.", 409);

  // Le créateur ne valide pas son propre dossier (TR-03).
  if (d.creeParId === actor.sub) {
    throw new ErreurMetier("Vous avez constitué ce dossier KYC : sa validation doit être faite par un autre acteur.", 403);
  }
  await verifierSeparation('kyc', id, 'kyc_validation', actor.sub);

  const full = await prisma.dossierKyc.findUniqueOrThrow({
    where: { id },
    include: { controles: true, piecesIdentite: true, client: true, prospect: true },
  });
  const nonEvalues = full.controles.filter((c) => c.resultat === null);
  if (nonEvalues.length > 0) {
    throw new ErreurMetier(`${nonEvalues.length} contrôle(s) restent à évaluer : ${nonEvalues.map((c) => c.libelle).join(' ; ')}`, 422);
  }
  const nonConformes = full.controles.filter((c) => c.resultat === 'non_conforme');
  if (nonConformes.length > 0) {
    throw new ErreurMetier(`Validation impossible : ${nonConformes.length} contrôle(s) non conforme(s). Rejetez le dossier ou faites corriger.`, 422);
  }

  const personne = full.client ?? full.prospect;
  const risque = evaluerRisque({
    nonConformes: 0,
    pieceExpiree: full.piecesIdentite.some((p) => p.dateExpiration && p.dateExpiration < new Date()),
    personneMorale: personne?.typePersonne === 'morale',
    nationaliteEtrangere: Boolean(personne?.nationalite && !/cameroun/i.test(personne.nationalite)),
    sansGeolocalisation: personne?.latitude == null,
    revenusMensuels: Number((full.client as { revenusMensuels?: Prisma.Decimal | null } | null)?.revenusMensuels ?? 0),
    correspondanceSurveillance: (await rechercherSurveillance({ nom: personne?.nom, prenom: personne?.prenom, numeroPiece: full.piecesIdentite[0]?.numero ?? personne?.numeroCni })).length > 0,
  });
  const niveau = niveauForce ?? risque.niveau;

  await prisma.$transaction(async (tx) => {
    await tx.dossierKyc.update({
      where: { id },
      data: { statut: 'valide', niveauRisque: niveau, scoreLcbft: risque.score, valideParId: actor.sub, valideAt: new Date() },
    });
    await consignerActe('kyc', id, 'kyc_validation', actor.sub, `Risque ${niveau} (${risque.score}/100)`, tx);
  });

  if (full.clientId) await debloquerDemandesEnAttenteKyc(full.clientId, id);

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'kyc', action: 'VALIDATE_KYC', entiteType: 'dossier_kyc', entiteId: id,
    description: `Validation du dossier ${d.reference}, risque ${niveau}`,
  });
  await archiverSansBloquer('dossier_kyc', id, actor.sub, 'Validation KYC');
  void emettre('kyc.traite', { entiteType: 'dossier_kyc', entiteId: id, agenceId: actor.agenceId, acteurId: actor.sub, donnees: { reference: d.reference, personne: '', resultat: 'validé', creeParId: d.creeParId, lien: `/dashboard/kyc/${id}` } });
  return { statut: 'valide', niveau_risque: niveau, score_lcbft: risque.score, facteurs: risque.facteurs };
}

export async function rejeter(actor: JwtPayload, id: number, motif: string) {
  const d = await dossierVisible(actor, id);
  if (d.statut !== 'en_controle') throw new ErreurMetier("Ce dossier n'est pas en cours de contrôle.", 409);
  await prisma.$transaction(async (tx) => {
    await tx.dossierKyc.update({ where: { id }, data: { statut: 'rejete', motifRejet: motif, valideParId: actor.sub, valideAt: new Date() } });
    await consignerActe('kyc', id, 'kyc_rejet', actor.sub, motif, tx);
  });
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'kyc', action: 'REJECT_KYC', entiteType: 'dossier_kyc', entiteId: id, description: `Rejet du dossier ${d.reference} : ${motif}`,
  });
  await archiverSansBloquer('dossier_kyc', id, actor.sub, 'Rejet KYC');
  void emettre('kyc.traite', { entiteType: 'dossier_kyc', entiteId: id, agenceId: actor.agenceId, acteurId: actor.sub, donnees: { reference: d.reference, personne: '', resultat: 'rejeté', creeParId: d.creeParId, lien: `/dashboard/kyc/${id}` } });
  return { statut: 'rejete' };
}

/** Rouvre un dossier rejeté pour correction ; l'historique reste dans les actes et l'archive. */
export async function rouvrir(actor: JwtPayload, id: number) {
  const d = await dossierVisible(actor, id);
  if (d.statut !== 'rejete') throw new ErreurMetier('Seul un dossier rejeté peut être rouvert.', 409);
  await prisma.$transaction(async (tx) => {
    await tx.dossierKyc.update({ where: { id }, data: { statut: 'brouillon', motifRejet: null, valideParId: null, valideAt: null } });
    await tx.controleKyc.updateMany({ where: { dossierId: id }, data: { resultat: null, commentaire: null } });
    await consignerActe('kyc', id, 'kyc_reouverture', actor.sub, undefined, tx);
  });
  return { statut: 'brouillon' };
}

export async function archiver(actor: JwtPayload, id: number) {
  const d = await dossierVisible(actor, id);
  if (!['valide', 'rejete'].includes(d.statut)) throw new ErreurMetier("Seul un dossier validé ou rejeté peut être archivé.", 409);
  const archive = await archiverSansBloquer('dossier_kyc', id, actor.sub, 'Archivage manuel');
  if (!archive) throw new ErreurMetier("L'archivage a échoué.", 500);
  await prisma.dossierKyc.update({ where: { id }, data: { archiveAt: new Date() } });
  await consignerActe('kyc', id, 'kyc_archivage', actor.sub);
  return archive;
}
