import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { StatutClient } from '@prisma/client';

const include = {
  agence: { select: { id: true, nom: true } },
  commercial: { select: { id: true, prenom: true, nom: true } },
  _count: { select: { comptes: true } },
} as const;

function agenceFilter(actor: JwtPayload) {
  if (actor.role === 'admin') return {};
  if (actor.role === 'agent') return { commercialId: actor.sub };
  return { agenceId: actor.agenceId };
}

export async function list(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = { ...agenceFilter(actor) };

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
      comptes: {
        include: { produit: { select: { id: true, nom: true, groupe: { select: { id: true, nom: true } } } } },
      },
      piecesJointes: true,
    },
  });
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
      ...(data.revenu_mensuel !== undefined && { revenuMensuel: data.revenu_mensuel as string }),
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
