import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';
import { rendreGabarit } from '../../lib/notifier';
import { mettreEnFileSms } from '../../lib/sms';
import { criteresCibleSchema, resoudreCiblesClient, type CriteresCible } from '../../lib/cibleClient';

/**
 * Campagnes commerciales 360° (compléments stratégiques, point 5) : ciblage par segmentation
 * (cycle de vie, marché, secteur, potentiel), relié au calendrier camerounais (point 6). Le canal
 * WhatsApp est accepté mais n'envoie rien tant que le Lot 13 (registre de canaux) n'est pas
 * livré : les cibles sont enregistrées avec le statut `en_attente_canal`.
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);

const schema = z.object({
  nom: z.string().min(1).max(200),
  criteres: criteresCibleSchema,
  canal: z.enum(['sms', 'whatsapp', 'email']),
  message: z.string().min(1).max(600),
  date_debut: z.string().min(8),
  date_fin: z.string().min(8).nullish(),
  evenement_calendrier_id: z.number().int().positive().nullish(),
});

const include = {
  creePar: { select: { id: true, prenom: true, nom: true } },
  evenementCalendrier: { select: { id: true, nom: true } },
  _count: { select: { cibles: true } },
} as const;

const router = Router();
router.use(authenticate);

router.get('/', can('communication:VIEW'), wrap(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const where = q.statut ? { statut: q.statut as never } : {};
  return success(res, await prisma.campagne.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100 }));
}));

router.get('/:id', can('communication:VIEW'), wrap(async (req, res) => {
  const c = await prisma.campagne.findUnique({
    where: { id: pid(req) },
    include: {
      ...include,
      cibles: { take: 200, orderBy: { createdAt: 'desc' }, include: { client: { select: { id: true, nom: true, prenom: true, telephone: true } } } },
    },
  });
  if (!c) throw new ErreurMetier('Campagne introuvable', 404);
  const parStatut = await prisma.campagneCible.groupBy({ by: ['statut'], where: { campagneId: c.id }, _count: true });
  return success(res, { ...c, resume: Object.fromEntries(parStatut.map((s) => [s.statut, s._count])) });
}));

router.post('/', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const b = schema.parse(req.body);
  // Aperçu du nombre de cibles avant création, pour que l'auteur sache ce qu'il s'apprête à cibler.
  const nbCibles = await prisma.client.count({ where: resoudreCiblesClient(b.criteres) });
  const c = await prisma.campagne.create({
    data: {
      nom: b.nom, criteres: b.criteres as never, canal: b.canal, message: b.message,
      dateDebut: new Date(b.date_debut), dateFin: b.date_fin ? new Date(b.date_fin) : null,
      evenementCalendrierId: b.evenement_calendrier_id ?? null, creeParId: req.user!.sub,
    },
    include,
  });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'notifications', action: 'CREATE_CAMPAGNE', entiteType: 'campagne', entiteId: c.id, description: `Campagne « ${c.nom} » créée, ${nbCibles} cible(s) estimée(s)` });
  return created(res, { ...c, nb_cibles_estime: nbCibles });
}));

/**
 * Fige la liste des cibles et met les messages SMS en file (`lib/sms.ts`, déjà traitée par la
 * tâche planifiée `file_sms`). Idempotent : relancer une campagne déjà lancée ne recible pas les
 * clients déjà enregistrés (`skipDuplicates`), pour ne jamais spammer deux fois le même client.
 */
router.post('/:id/lancer', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const campagne = await prisma.campagne.findUniqueOrThrow({ where: { id: pid(req) } });
  if (campagne.statut === 'annulee' || campagne.statut === 'terminee') throw new ErreurMetier(`Campagne déjà ${campagne.statut} : elle ne peut pas être relancée.`, 409);

  const criteres = campagne.criteres as CriteresCible;
  const clients = await prisma.client.findMany({ where: resoudreCiblesClient(criteres), select: { id: true, nom: true, prenom: true, telephone: true } });

  await prisma.campagneCible.createMany({ data: clients.map((c) => ({ campagneId: campagne.id, clientId: c.id })), skipDuplicates: true });
  const aTraiter = await prisma.campagneCible.findMany({ where: { campagneId: campagne.id, statut: 'ciblee' }, include: { client: { select: { nom: true, prenom: true, telephone: true } } } });

  let misesEnFile = 0, enAttenteCanal = 0, echecs = 0;
  for (const cible of aTraiter) {
    if (campagne.canal === 'email') {
      // email : aucun envoi tant que le canal n'est pas construit (hors périmètre des Lots 9-14).
      await prisma.campagneCible.update({ where: { id: cible.id }, data: { statut: 'en_attente_canal' } });
      enAttenteCanal++;
      continue;
    }
    const message = rendreGabarit(campagne.message, { prenom: cible.client.prenom ?? '', nom: cible.client.nom });
    const envoye = await mettreEnFileSms({ telephone: cible.client.telephone, message, entiteType: 'campagne', entiteId: campagne.id, canal: campagne.canal });
    await prisma.campagneCible.update({ where: { id: cible.id }, data: { statut: envoye ? 'mise_en_file' : 'echec', envoyeAt: envoye ? new Date() : null } });
    if (envoye) misesEnFile++; else echecs++;
  }

  await prisma.campagne.update({ where: { id: campagne.id }, data: { statut: 'en_cours' } });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'notifications', action: 'LANCER_CAMPAGNE', entiteType: 'campagne', entiteId: campagne.id, description: `Campagne « ${campagne.nom} » lancée : ${misesEnFile} mise(s) en file, ${enAttenteCanal} en attente de canal, ${echecs} échec(s)` });
  return success(res, { nb_cibles: clients.length, mises_en_file: misesEnFile, en_attente_canal: enAttenteCanal, echecs });
}));

router.post('/:id/cloturer', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const c = await prisma.campagne.update({ where: { id: pid(req) }, data: { statut: 'terminee' } });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'notifications', action: 'CLOTURER_CAMPAGNE', entiteType: 'campagne', entiteId: c.id, description: `Campagne « ${c.nom} » clôturée` });
  return success(res, c);
}));

router.post('/:id/annuler', can('communication:CONFIGURE'), wrap(async (req, res) => {
  const c = await prisma.campagne.update({ where: { id: pid(req) }, data: { statut: 'annulee' } });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'notifications', action: 'ANNULER_CAMPAGNE', entiteType: 'campagne', entiteId: c.id, description: `Campagne « ${c.nom} » annulée` });
  return success(res, c);
}));

/**
 * Entonnoir de conversion d'une campagne (Lot 15, doc segmentation §7) : du ciblage à
 * l'octroi, via l'attribution manuelle (`campagne_id`) posée à la création d'un prospect ou
 * d'une demande de crédit. Aucune infrastructure de tracking : l'attribution est déclarative,
 * saisie par le commercial quand le contact provient effectivement de la campagne.
 */
router.get('/:id/funnel', can('communication:VIEW'), wrap(async (req, res) => {
  const campagneId = pid(req);
  await prisma.campagne.findUniqueOrThrow({ where: { id: campagneId } });

  const [cibles, atteints, prospectsCrees, convertis, demandesCreees, accordees] = await Promise.all([
    prisma.campagneCible.count({ where: { campagneId } }),
    prisma.campagneCible.count({ where: { campagneId, statut: { notIn: ['echec', 'en_attente_canal'] } } }),
    prisma.prospect.count({ where: { campagneId } }),
    prisma.prospect.count({ where: { campagneId, statut: 'converti' } }),
    prisma.demandeCredit.count({ where: { campagneId } }),
    prisma.demandeCredit.count({ where: { campagneId, statut: { in: ['approuvee', 'decaissee', 'cloturee'] } } }),
  ]);

  return success(res, { cibles, atteints, prospects_crees: prospectsCrees, convertis, demandes_creees: demandesCreees, accordees });
}));

export default router;
