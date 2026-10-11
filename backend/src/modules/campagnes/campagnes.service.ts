import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';
import { rendreGabarit } from '../../lib/notifier';
import { mettreEnFileSms } from '../../lib/sms';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { criteresCibleSchema, resoudreCiblesClient, type CriteresCible } from '../../lib/cibleClient';
import type { JwtPayload } from '../../middleware/auth';

/**
 * Module Campagnes marketing : fiche de campagne (dates, description, budget, responsable),
 * personnes liées (équipe interne, cibles clients et prospects), objectifs chiffrés rattachés
 * (`Objectif.campagneId`, facultatif des deux côtés) et évaluation comparée des campagnes.
 *
 * L'envoi de messages reste celui des compléments stratégiques (point 5) : file SMS/WhatsApp via
 * `lib/sms.ts`, email en attente de canal. Une campagne sans canal (terrain, événement) n'envoie
 * rien : ses cibles sont figées au lancement et suivies par l'attribution déclarative
 * (`campagne_id` posé sur les prospects et demandes de crédit).
 */

export const TYPES_CAMPAGNE = ['acquisition', 'fidelisation', 'reactivation', 'cross_selling', 'notoriete', 'evenementiel', 'recouvrement', 'autre'] as const;
const STATUTS_ACCORDES = ['approuvee', 'decaissee', 'cloturee'] as const;
const STATUTS_DECAISSES = ['decaissee', 'cloturee'] as const;

const date = z.string().min(8);
const montant = z.coerce.number().nonnegative();
const membreSchema = z.object({ utilisateur_id: z.number().int().positive(), role: z.enum(['responsable', 'membre', 'observateur']).default('membre') });

export const campagneSchema = z.object({
  nom: z.string().min(1).max(200),
  type: z.enum(TYPES_CAMPAGNE).default('autre'),
  description: z.string().max(5000).nullish(),
  objectif_general: z.string().max(2000).nullish(),
  criteres: criteresCibleSchema.default({}),
  canal: z.enum(['sms', 'whatsapp', 'email']).nullish(),
  message: z.string().max(600).nullish(),
  date_debut: date,
  date_fin: date.nullish(),
  budget: montant.nullish(),
  cout_reel: montant.nullish(),
  responsable_id: z.number().int().positive().nullish(),
  agence_id: z.number().int().positive().nullish(),
  evenement_calendrier_id: z.number().int().positive().nullish(),
  membres: z.array(membreSchema).max(200).optional(),
  objectif_ids: z.array(z.number().int().positive()).max(100).optional(),
});
export type CampagneSaisie = z.infer<typeof campagneSchema>;

function verifierCoherence(b: Partial<CampagneSaisie>, actuel?: { canal: string | null; message: string | null; dateDebut: Date; dateFin: Date | null }) {
  const canal = b.canal !== undefined ? b.canal : actuel?.canal;
  const message = b.message !== undefined ? b.message : actuel?.message;
  if (canal && !message?.trim()) throw new ErreurMetier('Un message est requis dès qu\'un canal d\'envoi est choisi.', 422);
  const debut = b.date_debut ? new Date(b.date_debut) : actuel?.dateDebut;
  const fin = b.date_fin !== undefined ? (b.date_fin ? new Date(b.date_fin) : null) : actuel?.dateFin;
  if (debut && fin && fin < debut) throw new ErreurMetier('La date de fin précède la date de début.', 422);
}

const nul = <T>(v: T | null | undefined) => (v === undefined ? undefined : v ?? null);

function donnees(b: Partial<CampagneSaisie>) {
  return {
    ...(b.nom !== undefined && { nom: b.nom }),
    ...(b.type !== undefined && { type: b.type }),
    ...(b.description !== undefined && { description: nul(b.description) }),
    ...(b.objectif_general !== undefined && { objectifGeneral: nul(b.objectif_general) }),
    ...(b.criteres !== undefined && { criteres: b.criteres as Prisma.InputJsonValue }),
    ...(b.canal !== undefined && { canal: nul(b.canal) }),
    ...(b.message !== undefined && { message: b.message?.trim() ? b.message : null }),
    ...(b.date_debut !== undefined && { dateDebut: new Date(b.date_debut) }),
    ...(b.date_fin !== undefined && { dateFin: b.date_fin ? new Date(b.date_fin) : null }),
    ...(b.budget !== undefined && { budget: nul(b.budget) }),
    ...(b.cout_reel !== undefined && { coutReel: nul(b.cout_reel) }),
    ...(b.responsable_id !== undefined && { responsableId: nul(b.responsable_id) }),
    ...(b.agence_id !== undefined && { agenceId: nul(b.agence_id) }),
    ...(b.evenement_calendrier_id !== undefined && { evenementCalendrierId: nul(b.evenement_calendrier_id) }),
  };
}

const utilisateurCourt = { select: { id: true, prenom: true, nom: true } } as const;
export const includeListe = {
  creePar: utilisateurCourt,
  responsable: utilisateurCourt,
  agence: { select: { id: true, nom: true } },
  evenementCalendrier: { select: { id: true, nom: true } },
  _count: { select: { cibles: true, membres: true, objectifs: true, prospectsOrigine: true, demandesOrigine: true } },
} as const;

const log = (actor: JwtPayload, action: string, id: number, description: string) =>
  createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action, entiteType: 'campagne', entiteId: id, description });

export async function lister(q: Record<string, unknown>) {
  const where: Prisma.CampagneWhereInput = {};
  if (q.statut) where.statut = q.statut as never;
  if (q.type) where.type = q.type as never;
  if (q.agence_id) where.agenceId = parseInt(String(q.agence_id), 10);
  if (q.search) where.nom = { contains: String(q.search), mode: 'insensitive' };
  if (q.annee) {
    const an = parseInt(String(q.annee), 10);
    where.dateDebut = { gte: new Date(Date.UTC(an, 0, 1)), lt: new Date(Date.UTC(an + 1, 0, 1)) };
  }
  // Les campagnes actives (sélecteur des prospects/crédits) : lancées et non annulées.
  if (q.actives === 'true') where.statut = { in: ['en_cours', 'terminee'] };
  return prisma.campagne.findMany({ where, include: includeListe, orderBy: [{ dateDebut: 'desc' }, { id: 'desc' }], take: 200 });
}

export async function obtenir(id: number) {
  const c = await prisma.campagne.findUnique({
    where: { id },
    include: {
      ...includeListe,
      membres: { include: { utilisateur: { select: { id: true, prenom: true, nom: true, email: true, fonction: true } } }, orderBy: { createdAt: 'asc' } },
      objectifs: { include: { agence: { select: { id: true, nom: true } }, equipe: { select: { id: true, nom: true } } }, orderBy: { dateDebut: 'asc' } },
      cibles: {
        take: 200, orderBy: { createdAt: 'desc' },
        include: { client: { select: { id: true, nom: true, prenom: true, telephone: true } }, prospect: { select: { id: true, nom: true, prenom: true, telephone: true, statut: true } } },
      },
    },
  });
  if (!c) throw new ErreurMetier('Campagne introuvable', 404);
  const [parStatut, nbCiblesEstime] = await Promise.all([
    prisma.campagneCible.groupBy({ by: ['statut'], where: { campagneId: id }, _count: true }),
    prisma.client.count({ where: resoudreCiblesClient(c.criteres as CriteresCible) }),
  ]);
  return {
    ...c,
    objectifs: c.objectifs.map((o) => ({ ...o, pourcentage: Number(o.cible) > 0 ? arrondi((Number(o.realise) / Number(o.cible)) * 100) : 0 })),
    resume: Object.fromEntries(parStatut.map((s) => [s.statut, s._count])),
    nb_cibles_estime: nbCiblesEstime,
  };
}

export async function apercuCibles(criteres: CriteresCible) {
  return { nb_cibles_estime: await prisma.client.count({ where: resoudreCiblesClient(criteres) }) };
}

export async function personnel(search: string) {
  const s = search.trim() ? { contains: search.trim(), mode: 'insensitive' as const } : undefined;
  return prisma.utilisateur.findMany({
    where: { actif: true, ...(s ? { OR: [{ nom: s }, { prenom: s }, { email: s }, { fonction: s }] } : {}) },
    select: { id: true, prenom: true, nom: true, email: true, fonction: true, agence: { select: { nom: true } } },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }], take: 30,
  });
}

async function remplacerMembres(tx: Prisma.TransactionClient, campagneId: number, membres: { utilisateur_id: number; role: 'responsable' | 'membre' | 'observateur' }[]) {
  await tx.campagneMembre.deleteMany({ where: { campagneId } });
  const uniques = [...new Map(membres.map((m) => [m.utilisateur_id, m])).values()];
  if (uniques.length) await tx.campagneMembre.createMany({ data: uniques.map((m) => ({ campagneId, utilisateurId: m.utilisateur_id, role: m.role })) });
}

export async function creer(actor: JwtPayload, b: CampagneSaisie) {
  verifierCoherence(b);
  const c = await prisma.$transaction(async (tx) => {
    const cree = await tx.campagne.create({ data: { ...donnees(b), nom: b.nom, criteres: b.criteres as Prisma.InputJsonValue, dateDebut: new Date(b.date_debut), creeParId: actor.sub } });
    const membres = [...(b.membres ?? [])];
    if (b.responsable_id && !membres.some((m) => m.utilisateur_id === b.responsable_id)) membres.unshift({ utilisateur_id: b.responsable_id, role: 'responsable' });
    if (membres.length) await remplacerMembres(tx, cree.id, membres);
    if (b.objectif_ids?.length) await tx.objectif.updateMany({ where: { id: { in: b.objectif_ids } }, data: { campagneId: cree.id } });
    return tx.campagne.findUniqueOrThrow({ where: { id: cree.id }, include: includeListe });
  });
  const { nb_cibles_estime } = await apercuCibles(b.criteres);
  await log(actor, 'CREATE_CAMPAGNE', c.id, `Campagne « ${c.nom} » créée, ${nb_cibles_estime} cible(s) estimée(s)`);
  return { ...c, nb_cibles_estime };
}

export async function modifier(actor: JwtPayload, id: number, b: Partial<CampagneSaisie>) {
  const actuel = await prisma.campagne.findUnique({ where: { id } });
  if (!actuel) throw new ErreurMetier('Campagne introuvable', 404);
  if (actuel.statut === 'annulee') throw new ErreurMetier('Une campagne annulée ne se modifie plus.', 409);
  verifierCoherence(b, actuel);
  const c = await prisma.$transaction(async (tx) => {
    await tx.campagne.update({ where: { id }, data: donnees(b) });
    if (b.membres !== undefined) await remplacerMembres(tx, id, b.membres);
    return tx.campagne.findUniqueOrThrow({ where: { id }, include: includeListe });
  });
  await log(actor, 'UPDATE_CAMPAGNE', id, `Campagne « ${c.nom} » modifiée`);
  return c;
}

export async function supprimer(actor: JwtPayload, id: number) {
  const c = await prisma.campagne.findUnique({ where: { id } });
  if (!c) throw new ErreurMetier('Campagne introuvable', 404);
  if (c.statut !== 'brouillon') throw new ErreurMetier('Seul un brouillon peut être supprimé ; annulez la campagne pour l\'arrêter.', 409);
  await prisma.campagne.delete({ where: { id } });
  await log(actor, 'DELETE_CAMPAGNE', id, `Brouillon de campagne « ${c.nom} » supprimé`);
}

export async function changerStatut(actor: JwtPayload, id: number, statut: 'terminee' | 'annulee') {
  const c = await prisma.campagne.update({ where: { id }, data: { statut } });
  await log(actor, statut === 'terminee' ? 'CLOTURER_CAMPAGNE' : 'ANNULER_CAMPAGNE', id, `Campagne « ${c.nom} » ${statut === 'terminee' ? 'clôturée' : 'annulée'}`);
  return c;
}

/**
 * Fige les cibles issues des critères et traite toutes les cibles encore `ciblee` (y compris
 * celles ajoutées à la main, clients comme prospects). Idempotent : relancer ne recible jamais
 * deux fois la même personne (`skipDuplicates` et filtre sur `ciblee`).
 */
export async function lancer(actor: JwtPayload, id: number) {
  const campagne = await prisma.campagne.findUnique({ where: { id } });
  if (!campagne) throw new ErreurMetier('Campagne introuvable', 404);
  if (campagne.statut === 'annulee' || campagne.statut === 'terminee') throw new ErreurMetier(`Campagne déjà ${campagne.statut} : elle ne peut pas être relancée.`, 409);

  const clients = await prisma.client.findMany({ where: resoudreCiblesClient(campagne.criteres as CriteresCible), select: { id: true } });
  await prisma.campagneCible.createMany({ data: clients.map((c) => ({ campagneId: id, clientId: c.id })), skipDuplicates: true });

  let misesEnFile = 0, enAttenteCanal = 0, echecs = 0;
  if (campagne.canal) {
    const aTraiter = await prisma.campagneCible.findMany({
      where: { campagneId: id, statut: 'ciblee' },
      include: { client: { select: { nom: true, prenom: true, telephone: true } }, prospect: { select: { nom: true, prenom: true, telephone: true } } },
    });
    for (const cible of aTraiter) {
      const personne = cible.client ?? cible.prospect;
      if (campagne.canal === 'email') {
        // email : aucun envoi tant que le canal n'est pas construit (hors périmètre des Lots 9-14).
        await prisma.campagneCible.update({ where: { id: cible.id }, data: { statut: 'en_attente_canal' } });
        enAttenteCanal++;
        continue;
      }
      const message = rendreGabarit(campagne.message ?? '', { prenom: personne?.prenom ?? '', nom: personne?.nom ?? '' });
      const envoye = personne ? await mettreEnFileSms({ telephone: personne.telephone, message, entiteType: 'campagne', entiteId: id, canal: campagne.canal }) : null;
      await prisma.campagneCible.update({ where: { id: cible.id }, data: { statut: envoye ? 'mise_en_file' : 'echec', envoyeAt: envoye ? new Date() : null } });
      if (envoye) misesEnFile++; else echecs++;
    }
  }
  const nbCibles = await prisma.campagneCible.count({ where: { campagneId: id } });

  await prisma.campagne.update({ where: { id }, data: { statut: 'en_cours' } });
  await log(actor, 'LANCER_CAMPAGNE', id, `Campagne « ${campagne.nom} » lancée : ${nbCibles} cible(s), ${misesEnFile} mise(s) en file, ${enAttenteCanal} en attente de canal, ${echecs} échec(s)`);
  return { nb_cibles: nbCibles, mises_en_file: misesEnFile, en_attente_canal: enAttenteCanal, echecs };
}

// ── Personnes liées ────────────────────────────────────────────────────────

export async function listerCibles(id: number, q: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(q.page ?? 1), 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(String(q.per_page ?? 25), 10) || 25));
  const where: Prisma.CampagneCibleWhereInput = { campagneId: id };
  if (q.type === 'client') where.clientId = { not: null };
  if (q.type === 'prospect') where.prospectId = { not: null };
  if (q.statut) where.statut = q.statut as never;
  if (q.search) {
    const s = { contains: String(q.search), mode: 'insensitive' as const };
    where.OR = [{ client: { OR: [{ nom: s }, { prenom: s }, { telephone: s }] } }, { prospect: { OR: [{ nom: s }, { prenom: s }, { telephone: s }] } }];
  }
  const [items, total] = await Promise.all([
    prisma.campagneCible.findMany({
      where, skip: (page - 1) * perPage, take: perPage, orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, nom: true, prenom: true, telephone: true, agence: { select: { nom: true } } } },
        prospect: { select: { id: true, nom: true, prenom: true, telephone: true, statut: true } },
        ajoutePar: utilisateurCourt,
      },
    }),
    prisma.campagneCible.count({ where }),
  ]);
  return { items, meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) } };
}

export async function ajouterCibles(actor: JwtPayload, id: number, b: { client_ids?: number[]; prospect_ids?: number[]; note?: string | null }) {
  const c = await prisma.campagne.findUnique({ where: { id }, select: { statut: true, nom: true } });
  if (!c) throw new ErreurMetier('Campagne introuvable', 404);
  if (c.statut === 'annulee' || c.statut === 'terminee') throw new ErreurMetier(`Campagne ${c.statut} : on ne peut plus y lier de personnes.`, 409);
  const base = { campagneId: id, ajoutManuel: true, ajouteParId: actor.sub, note: b.note ?? null };
  const r1 = b.client_ids?.length ? await prisma.campagneCible.createMany({ data: b.client_ids.map((clientId) => ({ ...base, clientId })), skipDuplicates: true }) : { count: 0 };
  const r2 = b.prospect_ids?.length ? await prisma.campagneCible.createMany({ data: b.prospect_ids.map((prospectId) => ({ ...base, prospectId })), skipDuplicates: true }) : { count: 0 };
  await log(actor, 'LIER_CIBLES_CAMPAGNE', id, `${r1.count} client(s) et ${r2.count} prospect(s) liés à « ${c.nom} »`);
  return { clients_ajoutes: r1.count, prospects_ajoutes: r2.count };
}

export async function retirerCible(actor: JwtPayload, id: number, cibleId: number) {
  const cible = await prisma.campagneCible.findFirst({ where: { id: cibleId, campagneId: id } });
  if (!cible) throw new ErreurMetier('Cible introuvable', 404);
  if (cible.statut === 'mise_en_file') throw new ErreurMetier('Un message a déjà été mis en file pour cette personne : elle reste dans l\'historique de la campagne.', 409);
  await prisma.campagneCible.delete({ where: { id: cibleId } });
  await log(actor, 'RETIRER_CIBLE_CAMPAGNE', id, `Cible #${cibleId} retirée de la campagne`);
}

export async function definirMembres(actor: JwtPayload, id: number, membres: z.infer<typeof membreSchema>[]) {
  await prisma.$transaction((tx) => remplacerMembres(tx, id, membres));
  await log(actor, 'MEMBRES_CAMPAGNE', id, `Équipe de campagne mise à jour (${membres.length} membre(s))`);
  return prisma.campagneMembre.findMany({ where: { campagneId: id }, include: { utilisateur: { select: { id: true, prenom: true, nom: true, email: true, fonction: true } } } });
}
export { membreSchema };

export async function lierObjectifs(actor: JwtPayload, id: number, objectifIds: number[], lier: boolean) {
  await prisma.campagne.findUniqueOrThrow({ where: { id } });
  const r = await prisma.objectif.updateMany({ where: lier ? { id: { in: objectifIds } } : { id: { in: objectifIds }, campagneId: id }, data: { campagneId: lier ? id : null } });
  await log(actor, lier ? 'LIER_OBJECTIFS_CAMPAGNE' : 'DELIER_OBJECTIFS_CAMPAGNE', id, `${r.count} objectif(s) ${lier ? 'rattaché(s)' : 'détaché(s)'}`);
  return { modifies: r.count };
}

// ── Évaluation ─────────────────────────────────────────────────────────────

export async function funnel(id: number) {
  await prisma.campagne.findUniqueOrThrow({ where: { id } });
  const [cibles, atteints, prospectsCrees, convertis, demandesCreees, accordees] = await Promise.all([
    prisma.campagneCible.count({ where: { campagneId: id } }),
    prisma.campagneCible.count({ where: { campagneId: id, statut: { notIn: ['echec', 'en_attente_canal'] } } }),
    prisma.prospect.count({ where: { campagneId: id } }),
    prisma.prospect.count({ where: { campagneId: id, statut: 'converti' } }),
    prisma.demandeCredit.count({ where: { campagneId: id } }),
    prisma.demandeCredit.count({ where: { campagneId: id, statut: { in: [...STATUTS_ACCORDES] } } }),
  ]);
  return { cibles, atteints, prospects_crees: prospectsCrees, convertis, demandes_creees: demandesCreees, accordees };
}

const ratio = (a: number, b: number) => (b > 0 ? arrondi((a / b) * 100) : null);
const division = (a: number, b: number) => (b > 0 ? arrondi(a / b) : null);

/**
 * Indicateurs bruts par campagne, calculés en quelques requêtes groupées (pas de N+1). Le score
 * composite, ses critères et leurs poids sont laissés à l'écran : c'est l'utilisateur qui décide
 * de ce qui compte pour comparer ses campagnes.
 */
export async function evaluation(q: Record<string, unknown>) {
  const where: Prisma.CampagneWhereInput = { statut: q.statut ? (q.statut as never) : { not: 'annulee' } };
  if (q.type) where.type = q.type as never;
  if (q.agence_id) where.agenceId = parseInt(String(q.agence_id), 10);
  if (q.ids) where.id = { in: String(q.ids).split(',').map(Number).filter(Boolean) };
  if (q.debut || q.fin) {
    // Chevauchement de la période de campagne avec la fenêtre demandée.
    if (q.fin) where.dateDebut = { lte: new Date(String(q.fin)) };
    if (q.debut) where.OR = [{ dateFin: null }, { dateFin: { gte: new Date(String(q.debut)) } }];
  }
  const campagnes = await prisma.campagne.findMany({
    where, orderBy: { dateDebut: 'desc' }, take: 200,
    select: { id: true, nom: true, type: true, statut: true, canal: true, dateDebut: true, dateFin: true, budget: true, coutReel: true, agence: { select: { id: true, nom: true } }, responsable: utilisateurCourt, _count: { select: { membres: true } } },
  });
  const ids = campagnes.map((c) => c.id);
  if (ids.length === 0) return { campagnes: [], totaux: null };

  const [cibles, ciblesProspects, prospects, demandes, clients, objectifs] = await Promise.all([
    prisma.campagneCible.groupBy({ by: ['campagneId', 'statut'], where: { campagneId: { in: ids } }, _count: true }),
    prisma.campagneCible.groupBy({ by: ['campagneId'], where: { campagneId: { in: ids }, prospectId: { not: null } }, _count: true }),
    prisma.prospect.groupBy({ by: ['campagneId', 'statut'], where: { campagneId: { in: ids } }, _count: true }),
    prisma.demandeCredit.groupBy({ by: ['campagneId', 'statut'], where: { campagneId: { in: ids } }, _count: true, _sum: { montantAccorde: true, montantDemande: true } }),
    prisma.client.findMany({ where: { prospect: { campagneId: { in: ids } } }, select: { prospect: { select: { campagneId: true } } } }),
    prisma.objectif.findMany({ where: { campagneId: { in: ids } }, select: { campagneId: true, cible: true, realise: true, statut: true } }),
  ]);

  const maintenant = Date.now();
  const lignes = campagnes.map((c) => {
    const cc = cibles.filter((x) => x.campagneId === c.id);
    const nbCibles = cc.reduce((s, x) => s + x._count, 0);
    const atteints = cc.filter((x) => x.statut !== 'echec' && x.statut !== 'en_attente_canal').reduce((s, x) => s + x._count, 0);
    const pp = prospects.filter((x) => x.campagneId === c.id);
    const prospectsCrees = pp.reduce((s, x) => s + x._count, 0);
    const convertis = pp.filter((x) => x.statut === 'converti').reduce((s, x) => s + x._count, 0);
    const dd = demandes.filter((x) => x.campagneId === c.id);
    const nbDemandes = dd.reduce((s, x) => s + x._count, 0);
    const accordees = dd.filter((x) => (STATUTS_ACCORDES as readonly string[]).includes(x.statut));
    const decaissees = dd.filter((x) => (STATUTS_DECAISSES as readonly string[]).includes(x.statut));
    const somme = (l: typeof dd) => arrondi(l.reduce((s, x) => s + Number(x._sum.montantAccorde ?? x._sum.montantDemande ?? 0), 0));
    const montantAccorde = somme(accordees);
    const montantDecaisse = somme(decaissees);
    const nouveauxClients = clients.filter((x) => x.prospect?.campagneId === c.id).length;
    const oo = objectifs.filter((x) => x.campagneId === c.id);
    const avancements = oo.map((o) => (Number(o.cible) > 0 ? Math.min(100, (Number(o.realise) / Number(o.cible)) * 100) : 0));
    const cout = c.coutReel !== null ? Number(c.coutReel) : null;
    const budget = c.budget !== null ? Number(c.budget) : null;
    const debut = c.dateDebut.getTime();
    const fin = c.dateFin ? c.dateFin.getTime() + 86_400_000 : null;
    return {
      id: c.id, nom: c.nom, type: c.type, statut: c.statut, canal: c.canal, date_debut: c.dateDebut, date_fin: c.dateFin, agence: c.agence, responsable: c.responsable,
      membres: c._count.membres,
      cibles: nbCibles,
      cibles_prospects: ciblesProspects.find((x) => x.campagneId === c.id)?._count ?? 0,
      atteints,
      taux_atteinte: ratio(atteints, nbCibles),
      prospects_crees: prospectsCrees,
      convertis,
      taux_conversion: ratio(convertis, prospectsCrees),
      nouveaux_clients: nouveauxClients,
      demandes: nbDemandes,
      accordees: accordees.reduce((s, x) => s + x._count, 0),
      taux_accord: ratio(accordees.reduce((s, x) => s + x._count, 0), nbDemandes),
      montant_accorde: montantAccorde,
      montant_decaisse: montantDecaisse,
      budget,
      cout_reel: cout,
      consommation_budget: budget && cout !== null ? ratio(cout, budget) : null,
      cout_par_prospect: cout !== null ? division(cout, prospectsCrees) : null,
      cout_par_client: cout !== null ? division(cout, nouveauxClients) : null,
      rendement: cout !== null ? division(montantDecaisse, cout) : null,
      objectifs: oo.length,
      objectifs_atteints: oo.filter((o) => o.statut === 'atteint' || o.statut === 'depasse').length,
      avancement_objectifs: avancements.length ? arrondi(avancements.reduce((s, x) => s + x, 0) / avancements.length) : null,
      duree_jours: fin ? Math.max(1, Math.round((fin - debut) / 86_400_000)) : null,
      avancement_temps: fin ? Math.min(100, Math.max(0, arrondi(((maintenant - debut) / (fin - debut)) * 100))) : null,
    };
  });

  const s = (k: keyof (typeof lignes)[number]) => lignes.reduce((t, l) => t + (Number(l[k]) || 0), 0);
  const totaux = {
    campagnes: lignes.length,
    en_cours: lignes.filter((l) => l.statut === 'en_cours').length,
    cibles: s('cibles'), atteints: s('atteints'), prospects_crees: s('prospects_crees'), convertis: s('convertis'),
    nouveaux_clients: s('nouveaux_clients'), demandes: s('demandes'), accordees: s('accordees'),
    montant_accorde: s('montant_accorde'), montant_decaisse: s('montant_decaisse'), budget: s('budget'), cout_reel: s('cout_reel'),
    taux_atteinte: ratio(s('atteints'), s('cibles')), taux_conversion: ratio(s('convertis'), s('prospects_crees')),
    rendement: division(s('montant_decaisse'), s('cout_reel')),
  };
  return { campagnes: lignes, totaux };
}

/** Évolution hebdomadaire d'une campagne : messages envoyés, prospects, demandes, décaissements. */
export async function evolution(id: number) {
  const c = await prisma.campagne.findUniqueOrThrow({ where: { id } });
  const [envois, prospects, demandes] = await Promise.all([
    prisma.campagneCible.findMany({ where: { campagneId: id, envoyeAt: { not: null } }, select: { envoyeAt: true } }),
    prisma.prospect.findMany({ where: { campagneId: id }, select: { createdAt: true, statut: true } }),
    prisma.demandeCredit.findMany({ where: { campagneId: id }, select: { createdAt: true, dateDecaissement: true, montantAccorde: true, montantDemande: true } }),
  ]);
  const semaine = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const series = new Map<string, { semaine: string; envois: number; prospects: number; demandes: number; montant_decaisse: number }>();
  const ligne = (d: Date) => { const k = semaine(d); if (!series.has(k)) series.set(k, { semaine: k, envois: 0, prospects: 0, demandes: 0, montant_decaisse: 0 }); return series.get(k)!; };
  // Toutes les semaines de la campagne apparaissent, même vides, pour une lecture continue.
  const finPeriode = c.dateFin ?? new Date();
  for (let d = new Date(c.dateDebut); d <= finPeriode && series.size < 104; d = new Date(d.getTime() + 7 * 86_400_000)) ligne(d);
  envois.forEach((e) => ligne(e.envoyeAt!).envois++);
  prospects.forEach((p) => ligne(p.createdAt).prospects++);
  demandes.forEach((d) => {
    ligne(d.createdAt).demandes++;
    if (d.dateDecaissement) ligne(d.dateDecaissement).montant_decaisse += Number(d.montantAccorde ?? d.montantDemande);
  });
  return [...series.values()].sort((a, b) => a.semaine.localeCompare(b.semaine));
}
