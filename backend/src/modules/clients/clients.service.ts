import prisma from '../../lib/prisma';
import { parseMontant, zoneDuPoint } from '../../lib/montants';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { getResponsableEquipeIds } from '../../lib/teamScope';
import { StatutClient, TypeObjectifClient, StatutObjectifClient } from '@prisma/client';
import { recalculerScoresClients } from '../../lib/segmentation';

const include = {
  agence: { select: { id: true, nom: true } },
  commercial: { select: { id: true, prenom: true, nom: true } },
  _count: { select: { comptes: true } },
} as const;

async function agenceFilter(actor: JwtPayload) {
  if (actor.role === 'admin') return {};
  if (actor.role === 'agent') return { commercialId: actor.sub };
  if (actor.role === 'backoffice') {
    const equipeIds = await getResponsableEquipeIds(actor.sub);
    if (equipeIds.length === 0) return { id: -1 };
    return { commercial: { equipeId: { in: equipeIds } } };
  }
  return { agenceId: actor.agenceId };
}

export async function list(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = { ...(await agenceFilter(actor)) };

  if (query.statut) where.statut = query.statut;
  if (query.agence_id && actor.role === 'admin') where.agenceId = parseInt(query.agence_id as string, 10);
  if (query.commercial_id) where.commercialId = parseInt(query.commercial_id as string, 10);
  if (query.search) {
    where.OR = [
      { nom: { contains: query.search, mode: 'insensitive' } },
      { prenom: { contains: query.search, mode: 'insensitive' } },
      { telephone: { contains: query.search } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.client.findMany({ where, include, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where }),
  ]);
  return { items: items.map((c) => ({ ...c, nb_comptes: c._count.comptes })), meta: paginationMeta(page, perPage, total) };
}

export async function getOne(id: number) {
  return prisma.client.findUniqueOrThrow({
    where: { id },
    include: {
      agence: { select: { id: true, nom: true } },
      commercial: { select: { id: true, prenom: true, nom: true } },
      marche: { select: { id: true, nom: true, type: true } },
      secteur: { select: { id: true, nom: true } },
      metier: { select: { id: true, nom: true } },
      score: true,
      comptes: {
        include: { produit: { select: { id: true, nom: true, groupe: { select: { id: true, nom: true } } } } },
      },
      piecesJointes: true,
    },
  });
}

/**
 * Synthèse 360° (compléments stratégiques, points 11-12) : assemble sur la fiche client des
 * données qui existent déjà dans les modules crédit et recouvrement, sans les dupliquer.
 */
export async function synthese(id: number) {
  const [credits, dossiersRecouvrement] = await Promise.all([
    prisma.demandeCredit.findMany({
      where: { clientId: id },
      select: {
        id: true, reference: true, statut: true, montantAccorde: true, montantDemande: true, dateDecaissement: true,
        produit: { select: { nom: true } },
        echeances: { where: { statut: { not: 'payee' } }, orderBy: { dateEcheance: 'asc' }, select: { numero: true, dateEcheance: true, montantTotal: true, montantPaye: true, statut: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.dossierRecouvrement.findMany({
      where: { clientId: id, statut: { notIn: ['regularise', 'irrecouvrable'] } },
      include: {
        promesses: { orderBy: { createdAt: 'desc' }, take: 1 },
        relances: { orderBy: { relanceAt: 'desc' }, take: 1 },
      },
      orderBy: { ouvertAt: 'desc' },
    }),
  ]);

  return {
    credits: credits.map((c) => {
      const prochaine = c.echeances[0] ?? null;
      const enRetard = c.echeances.filter((e) => e.statut === 'en_retard' || e.statut === 'impayee');
      return {
        id: c.id, reference: c.reference, statut: c.statut, produit: c.produit.nom,
        montant: Number(c.montantAccorde ?? c.montantDemande), date_decaissement: c.dateDecaissement,
        prochaine_echeance: prochaine ? { numero: prochaine.numero, date: prochaine.dateEcheance, reste: Number(prochaine.montantTotal) - Number(prochaine.montantPaye) } : null,
        nb_echeances_en_retard: enRetard.length,
        montant_en_retard: enRetard.reduce((s, e) => s + (Number(e.montantTotal) - Number(e.montantPaye)), 0),
      };
    }),
    recouvrement: dossiersRecouvrement.map((d) => ({
      id: d.id, reference: d.reference, statut: d.statut, classe: d.classe, jours_retard: d.joursRetard,
      montant_impaye: Number(d.montantImpaye), niveau_relance: d.niveauAtteint,
      derniere_relance: d.relances[0] ? { canal: d.relances[0].canal, date: d.relances[0].relanceAt, resultat: d.relances[0].resultat } : null,
      derniere_promesse: d.promesses[0] ? { montant: Number(d.promesses[0].montant), date_promise: d.promesses[0].datePromise, statut: d.promesses[0].statut } : null,
      prochaine_action_at: d.prochaineActionAt,
    })),
  };
}

export async function create(data: Record<string, unknown>, actor: JwtPayload) {
  const c = await prisma.client.create({
    data: {
      typePersonne: (data.type_personne as never) ?? 'physique',
      nom: data.nom as string, prenom: data.prenom as string | undefined,
      genre: ((data.genre as string) || 'VIDE') as never,
      dateNaissance: data.date_naissance ? new Date(data.date_naissance as string) : null,
      lieuNaissance: data.lieu_naissance as string | undefined,
      nationalite: data.nationalite as string | undefined,
      numeroCni: data.numero_cni as string | undefined,
      nui: data.nui as string | undefined,
      formeJuridique: data.forme_juridique as string | undefined,
      sigle: data.sigle as string | undefined,
      rccm: data.rccm as string | undefined,
      capitalSocial: data.capital_social as string | undefined,
      telephone: data.telephone as string,
      telephoneSecondaire: data.telephone_secondaire as string | undefined,
      email: (data.email as string) ?? '',
      adresse: (data.adresse as string) ?? '',
      quartier: data.quartier as string | undefined,
      ville: data.ville as string | undefined,
      profession: data.profession as string | undefined,
      employeur: data.employeur as string | undefined,
      secteurActivite: data.secteur_activite as string | undefined,
      revenuMensuel: data.revenu_mensuel as string | undefined,
      revenusMensuels: parseMontant(data.revenu_mensuel as string | undefined),
      zoneId: await zoneDuPoint(data.latitude ? parseFloat(data.latitude as string) : null, data.longitude ? parseFloat(data.longitude as string) : null),
      situationFamiliale: ((data.situation_familiale as string) || 'VIDE') as never,
      nombreEnfants: (data.nombre_enfants as number) ?? 0,
      referentNom: data.referent_nom as string | undefined,
      referentTelephone: data.referent_telephone as string | undefined,
      referentRelation: data.referent_relation as string | undefined,
      latitude: data.latitude ? parseFloat(data.latitude as string) : null,
      longitude: data.longitude ? parseFloat(data.longitude as string) : null,
      agenceId: (data.agence_id as number),
      commercialId: (data.commercial_id as number) ?? actor.sub,
      statut: (data.statut as StatutClient) ?? 'actif',
      prospectId: data.prospect_id as number | null | undefined,
      notes: data.notes as string | undefined,
      marcheId: (data.marche_id as number | null) ?? undefined,
      secteurId: (data.secteur_id as number | null) ?? undefined,
      metierId: (data.metier_id as number | null) ?? undefined,
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'CREATE_CLIENT', entiteType: 'client', entiteId: c.id, description: `Création du client ${c.prenom} ${c.nom}`, impact: '+1 client' });
  return c;
}

export async function update(id: number, data: Record<string, unknown>, actor: JwtPayload) {
  const c = await prisma.client.update({
    where: { id },
    data: {
      ...(data.type_personne !== undefined && { typePersonne: data.type_personne as never }),
      ...(data.nom !== undefined && { nom: data.nom as string }),
      ...(data.prenom !== undefined && { prenom: data.prenom as string }),
      ...(data.genre !== undefined && { genre: ((data.genre as string) || 'VIDE') as never }),
      ...(data.date_naissance !== undefined && { dateNaissance: new Date(data.date_naissance as string) }),
      ...(data.lieu_naissance !== undefined && { lieuNaissance: data.lieu_naissance as string }),
      ...(data.nationalite !== undefined && { nationalite: data.nationalite as string }),
      ...(data.numero_cni !== undefined && { numeroCni: data.numero_cni as string }),
      ...(data.nui !== undefined && { nui: data.nui as string }),
      ...(data.forme_juridique !== undefined && { formeJuridique: data.forme_juridique as string }),
      ...(data.sigle !== undefined && { sigle: data.sigle as string }),
      ...(data.rccm !== undefined && { rccm: data.rccm as string }),
      ...(data.capital_social !== undefined && { capitalSocial: data.capital_social as string }),
      ...(data.telephone !== undefined && { telephone: data.telephone as string }),
      ...(data.telephone_secondaire !== undefined && { telephoneSecondaire: data.telephone_secondaire as string }),
      ...(data.email !== undefined && { email: data.email as string }),
      ...(data.adresse !== undefined && { adresse: data.adresse as string }),
      ...(data.quartier !== undefined && { quartier: data.quartier as string }),
      ...(data.ville !== undefined && { ville: data.ville as string }),
      ...(data.profession !== undefined && { profession: data.profession as string }),
      ...(data.employeur !== undefined && { employeur: data.employeur as string }),
      ...(data.secteur_activite !== undefined && { secteurActivite: data.secteur_activite as string }),
      ...(data.revenu_mensuel !== undefined && { revenuMensuel: data.revenu_mensuel as string, revenusMensuels: parseMontant(data.revenu_mensuel as string) }),
      ...(data.latitude !== undefined && data.longitude !== undefined && { zoneId: await zoneDuPoint(Number(data.latitude), Number(data.longitude)) }),
      ...(data.situation_familiale !== undefined && { situationFamiliale: ((data.situation_familiale as string) || 'VIDE') as never }),
      ...(data.nombre_enfants !== undefined && { nombreEnfants: data.nombre_enfants as number }),
      ...(data.referent_nom !== undefined && { referentNom: data.referent_nom as string }),
      ...(data.referent_telephone !== undefined && { referentTelephone: data.referent_telephone as string }),
      ...(data.referent_relation !== undefined && { referentRelation: data.referent_relation as string }),
      ...(data.latitude !== undefined && { latitude: data.latitude as number }),
      ...(data.longitude !== undefined && { longitude: data.longitude as number }),
      ...(data.agence_id !== undefined && { agenceId: data.agence_id as number }),
      ...(data.commercial_id !== undefined && { commercialId: data.commercial_id as number }),
      ...(data.statut !== undefined && { statut: data.statut as StatutClient }),
      ...(data.notes !== undefined && { notes: data.notes as string }),
      ...(data.marche_id !== undefined && { marcheId: data.marche_id as number | null }),
      ...(data.secteur_id !== undefined && { secteurId: data.secteur_id as number | null }),
      ...(data.metier_id !== undefined && { metierId: data.metier_id as number | null }),
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'UPDATE_CLIENT', entiteType: 'client', entiteId: id, description: `Modification du client ${c.prenom} ${c.nom}` });
  return c;
}

export async function updateStatut(id: number, statut: StatutClient, actor: JwtPayload) {
  const c = await prisma.client.update({ where: { id }, data: { statut }, include });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'UPDATE_CLIENT', entiteType: 'client', entiteId: id, description: `Statut client ${c.prenom} ${c.nom} → ${statut}` });
  return c;
}

export async function remove(id: number, actor: JwtPayload) {
  const c = await prisma.client.findUniqueOrThrow({
    where: { id },
    include: { comptes: { where: { statut: 'actif' }, select: { id: true } } },
  });
  if (c.comptes.length > 0) throw Object.assign(new Error('Impossible de supprimer : le client a des comptes actifs'), { status: 409 });
  await prisma.client.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'DELETE_CLIENT', entiteType: 'client', entiteId: id, description: `Suppression du client ${c.prenom} ${c.nom}` });
}

// ─────────────────────────────────────────────
// Compléments stratégiques : segmentation et objectifs personnels
// ─────────────────────────────────────────────

/** Liste des scores clients, pour la vue de segmentation (compléments stratégiques, point 1). */
export async function listScores(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const clientWhere = { ...(await agenceFilter(actor)) };
  const where: Record<string, unknown> = { client: clientWhere };
  if (query.cycle_vie) where.cycleVie = query.cycle_vie;
  const [items, total] = await Promise.all([
    prisma.scoreClient.findMany({
      where, skip, take, orderBy: [{ score: 'desc' }],
      include: { client: { select: { id: true, nom: true, prenom: true, telephone: true, commercial: { select: { id: true, prenom: true, nom: true } } } } },
    }),
    prisma.scoreClient.count({ where }),
  ]);
  return { items, meta: paginationMeta(page, perPage, total) };
}

export async function recalculerScores(actor: JwtPayload) {
  const r = await recalculerScoresClients();
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, module: 'marketing', action: 'RECALCUL_SCORES_CLIENTS', entiteType: 'client', entiteId: 'global', description: `Recalcul du score de ${r.traites} client(s)` });
  return r;
}

export async function listObjectifsClient(clientId: number) {
  return prisma.objectifClient.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, include: { compte: { select: { id: true, numero: true } } } });
}

export async function creerObjectifClient(clientId: number, data: { type: TypeObjectifClient; titre: string; montant_cible?: number | null; date_cible?: string | null; compte_id?: number | null }, actor: JwtPayload) {
  const o = await prisma.objectifClient.create({
    data: {
      clientId, type: data.type, titre: data.titre, montantCible: data.montant_cible ?? null,
      dateCible: data.date_cible ? new Date(data.date_cible) : null, compteId: data.compte_id ?? null, creeParId: actor.sub,
    },
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, module: 'marketing', action: 'CREATE_OBJECTIF_CLIENT', entiteType: 'objectif_client', entiteId: o.id, description: `Objectif « ${data.titre} » pour le client #${clientId}` });
  return o;
}

export async function updateObjectifClient(id: number, data: { titre?: string; montant_cible?: number | null; date_cible?: string | null; statut?: StatutObjectifClient }, actor: JwtPayload) {
  const o = await prisma.objectifClient.update({
    where: { id },
    data: {
      ...(data.titre !== undefined && { titre: data.titre }),
      ...(data.montant_cible !== undefined && { montantCible: data.montant_cible }),
      ...(data.date_cible !== undefined && { dateCible: data.date_cible ? new Date(data.date_cible) : null }),
      ...(data.statut !== undefined && { statut: data.statut }),
    },
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, module: 'marketing', action: 'UPDATE_OBJECTIF_CLIENT', entiteType: 'objectif_client', entiteId: o.id, description: `Modification de l'objectif « ${o.titre} »` });
  return o;
}
