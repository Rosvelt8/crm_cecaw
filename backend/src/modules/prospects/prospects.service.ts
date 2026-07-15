import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { StatutProspect } from '@prisma/client';
import { sendBienvenueClient } from '../../lib/mailer';

const TRANSITIONS: Record<StatutProspect, StatutProspect[]> = {
  nouveau: ['contacte', 'interesse', 'negocie', 'converti', 'perdu'],
  contacte: ['interesse', 'negocie', 'converti', 'perdu'],
  interesse: ['negocie', 'converti', 'perdu'],
  negocie: ['converti', 'perdu'],
  converti: [],
  perdu: ['nouveau'],
};

const include = {
  produitInteret: { select: { id: true, nom: true } },
  commercial: { select: { id: true, prenom: true, nom: true } },
  _count: { select: { piecesJointes: true } },
} as const;

function agenceFilter(actor: JwtPayload) {
  if (actor.role === 'admin') return {};
  if (actor.role === 'agent') return { commercialId: actor.sub };
  return { commercial: { agenceId: actor.agenceId } };
}

export async function list(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = { ...agenceFilter(actor) };

  if (query.statut) where.statut = query.statut;
  if (query.commercial_id) where.commercialId = parseInt(query.commercial_id as string, 10);
  if (query.produit_interet_id) where.produitInteretId = parseInt(query.produit_interet_id as string, 10);
  if (query.search) {
    where.OR = [
      { nom: { contains: query.search, mode: 'insensitive' } },
      { prenom: { contains: query.search, mode: 'insensitive' } },
      { telephone: { contains: query.search } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.date_debut || query.date_fin) {
    where.createdAt = {};
    if (query.date_debut) (where.createdAt as Record<string, unknown>).gte = new Date(query.date_debut as string);
    if (query.date_fin) (where.createdAt as Record<string, unknown>).lte = new Date(query.date_fin as string);
  }

  const [items, total] = await Promise.all([
    prisma.prospect.findMany({ where, include, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.prospect.count({ where }),
  ]);
  return { items: items.map((p) => ({ ...p, nb_pieces_jointes: p._count.piecesJointes })), meta: paginationMeta(page, perPage, total) };
}

export async function getOne(id: number) {
  return prisma.prospect.findUniqueOrThrow({
    where: { id },
    include: {
      produitInteret: { select: { id: true, nom: true } },
      commercial: { select: { id: true, prenom: true, nom: true } },
      piecesJointes: true,
    },
  });
}

export async function create(data: Record<string, unknown>, actor: JwtPayload) {
  const p = await prisma.prospect.create({
    data: {
      typePersonne: (data.type_personne as never) ?? 'physique',
      nom: data.nom as string,
      prenom: data.prenom as string | undefined,
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
      email: data.email as string | undefined,
      adresse: data.adresse as string | undefined,
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
      statut: (data.statut as StatutProspect) ?? 'nouveau',
      produitInteretId: data.produit_interet_id ? parseInt(data.produit_interet_id as string, 10) : null,
      commercialId: (data.commercial_id as number) ?? actor.sub,
      notes: data.notes as string | undefined,
      latitude: data.latitude ? parseFloat(data.latitude as string) : null,
      longitude: data.longitude ? parseFloat(data.longitude as string) : null,
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'CREATE_PROSPECT', entiteType: 'prospect', entiteId: p.id, description: `Création du prospect ${p.prenom} ${p.nom}`, impact: '+1 prospect' });
  return p;
}

export async function update(id: number, data: Record<string, unknown>, actor: JwtPayload) {
  const p = await prisma.prospect.update({
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
      ...(data.situation_familiale !== undefined && { situationFamiliale: ((data.situation_familiale as string) || 'VIDE') as never }),
      ...(data.nombre_enfants !== undefined && { nombreEnfants: data.nombre_enfants as number }),
      ...(data.statut !== undefined && { statut: data.statut as StatutProspect }),
      ...(data.produit_interet_id !== undefined && { produitInteretId: data.produit_interet_id as number | null }),
      ...(data.commercial_id !== undefined && { commercialId: data.commercial_id as number }),
      ...(data.notes !== undefined && { notes: data.notes as string }),
      ...(data.latitude !== undefined && { latitude: data.latitude as number }),
      ...(data.longitude !== undefined && { longitude: data.longitude as number }),
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'UPDATE_PROSPECT', entiteType: 'prospect', entiteId: id, description: `Modification du prospect ${p.prenom} ${p.nom}` });
  return p;
}

export async function updateStatut(id: number, statut: StatutProspect, actor: JwtPayload) {
  const current = await prisma.prospect.findUniqueOrThrow({ where: { id } });
  const allowed = TRANSITIONS[current.statut];
  if (!allowed.includes(statut)) throw Object.assign(new Error(`Transition ${current.statut} → ${statut} non autorisée`), { status: 422 });

  const p = await prisma.prospect.update({ where: { id }, data: { statut }, include });

  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'STATUT_PROSPECT', entiteType: 'prospect', entiteId: id, description: `Statut prospect ${p.prenom} ${p.nom} → ${statut}` });

  if (statut === 'converti') {
    const client = await prisma.client.create({
      data: {
        prospectId: id,
        typePersonne: current.typePersonne,
        nom: current.nom, prenom: current.prenom,
        genre: current.genre, dateNaissance: current.dateNaissance,
        lieuNaissance: current.lieuNaissance, nationalite: current.nationalite,
        numeroCni: current.numeroCni, nui: current.nui,
        formeJuridique: current.formeJuridique, sigle: current.sigle,
        rccm: current.rccm, capitalSocial: current.capitalSocial,
        telephone: current.telephone,
        telephoneSecondaire: current.telephoneSecondaire,
        email: current.email ?? '', adresse: current.adresse ?? '',
        quartier: current.quartier, ville: current.ville,
        profession: current.profession, employeur: current.employeur,
        secteurActivite: current.secteurActivite, revenuMensuel: current.revenuMensuel,
        situationFamiliale: current.situationFamiliale,
        nombreEnfants: current.nombreEnfants,
        referentNom: current.referentNom, referentTelephone: current.referentTelephone,
        referentRelation: current.referentRelation,
        latitude: current.latitude, longitude: current.longitude,
        agenceId: actor.agenceId ?? 1,
        commercialId: current.commercialId,
        statut: 'actif', notes: current.notes,
      },
    });
    await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'CONVERT_PROSPECT', entiteType: 'prospect', entiteId: id, description: `Conversion du prospect ${current.prenom} ${current.nom} en client`, impact: '+1 client' });
    if (current.email) {
      const agence = await prisma.agence.findUnique({ where: { id: actor.agenceId ?? 1 }, select: { nom: true } });
      sendBienvenueClient({ to: current.email, prenom: current.prenom ?? '', nom: current.nom, agence: agence?.nom ?? 'CECAW' }).catch(() => {});
    }
    return { prospect: p, client_cree: client };
  }

  return { prospect: p };
}

export async function remove(id: number, actor: JwtPayload) {
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id } });
  await prisma.prospect.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'DELETE_PROSPECT', entiteType: 'prospect', entiteId: id, description: `Suppression du prospect ${p.prenom} ${p.nom}` });
}
