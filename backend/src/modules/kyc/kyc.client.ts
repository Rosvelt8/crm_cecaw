import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { upload } from '../../middleware/upload';
import { success } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier, rolesEffectifs } from '../../lib/rbac';
import { arrondi } from '../../lib/finance/grilleAnalyse';

/**
 * Compléments du dossier client nécessaires au KYC et à l'analyse crédit : sources de revenus,
 * charges, ancienneté et localisation de l'activité, photo. Les totaux alimentent ensuite
 * la grille d'analyse.
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

async function clientAccessible(req: Request, id: number) {
  const c = await prisma.client.findUnique({ where: { id } });
  if (!c) throw new ErreurMetier('Client introuvable', 404);
  const roles = await rolesEffectifs(req.user!.sub, req.user!.role);
  const global = ['R03', 'R06', 'R15'].some((r) => roles.has(r));
  if (!global && req.user!.agenceId && c.agenceId !== req.user!.agenceId) throw new ErreurMetier('Ce client appartient à une autre agence.', 403);
  return c;
}

const montant = z.coerce.number().nonnegative();
const schema = z.object({
  revenus_mensuels: montant.optional(),
  anciennete_activite_mois: z.coerce.number().int().nonnegative().optional(),
  latitude_activite: z.coerce.number().min(-90).max(90).nullish(),
  longitude_activite: z.coerce.number().min(-180).max(180).nullish(),
  sources: z.array(z.object({ libelle: z.string().min(1), nature: z.string().optional(), montant_mensuel: montant, justifie: z.boolean().optional() })).optional(),
  charges: z.array(z.object({ libelle: z.string().min(1), categorie: z.string().optional(), montant_mensuel: montant })).optional(),
});

const router = Router();
router.use(authenticate);

router.get('/clients/:id/finances', can('kyc:VIEW', 'credit:VIEW'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = await clientAccessible(req, id);
  const [sources, charges] = await Promise.all([prisma.sourceRevenu.findMany({ where: { clientId: id }, orderBy: { id: 'asc' } }), prisma.chargeClient.findMany({ where: { clientId: id }, orderBy: { id: 'asc' } })]);
  return success(res, {
    revenus_mensuels: c.revenusMensuels, charges_mensuelles: c.chargesMensuelles, anciennete_activite_mois: c.ancienneteActiviteMois,
    latitude_activite: c.latitudeActivite, longitude_activite: c.longitudeActivite, photo_url: c.photoUrl, sources, charges,
    total_sources: arrondi(sources.reduce((s, x) => s + Number(x.montantMensuel), 0)), total_charges: arrondi(charges.reduce((s, x) => s + Number(x.montantMensuel), 0)),
  });
}));

router.put('/clients/:id/finances', can('kyc:CREATE', 'kyc:UPDATE'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await clientAccessible(req, id);
  const b = schema.parse(req.body);
  const totalSources = b.sources ? arrondi(b.sources.reduce((s, x) => s + x.montant_mensuel, 0)) : undefined;
  const totalCharges = b.charges ? arrondi(b.charges.reduce((s, x) => s + x.montant_mensuel, 0)) : undefined;

  await prisma.$transaction(async (tx) => {
    if (b.sources) {
      await tx.sourceRevenu.deleteMany({ where: { clientId: id } });
      await tx.sourceRevenu.createMany({ data: b.sources.map((x) => ({ clientId: id, libelle: x.libelle, nature: x.nature ?? null, montantMensuel: x.montant_mensuel, justifie: x.justifie ?? false })) });
    }
    if (b.charges) {
      await tx.chargeClient.deleteMany({ where: { clientId: id } });
      await tx.chargeClient.createMany({ data: b.charges.map((x) => ({ clientId: id, libelle: x.libelle, categorie: x.categorie ?? null, montantMensuel: x.montant_mensuel })) });
    }
    await tx.client.update({
      where: { id },
      data: {
        // Les revenus saisis directement l'emportent ; à défaut, ils se déduisent des sources déclarées.
        ...((b.revenus_mensuels ?? totalSources) !== undefined && { revenusMensuels: b.revenus_mensuels ?? totalSources }),
        ...(totalCharges !== undefined && { chargesMensuelles: totalCharges }),
        ...(b.anciennete_activite_mois !== undefined && { ancienneteActiviteMois: b.anciennete_activite_mois }),
        ...(b.latitude_activite !== undefined && { latitudeActivite: b.latitude_activite }),
        ...(b.longitude_activite !== undefined && { longitudeActivite: b.longitude_activite }),
      },
    });
  });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'kyc', action: 'UPDATE_FINANCES_CLIENT', entiteType: 'client', entiteId: id, description: `Revenus et charges du client #${id} mis à jour` });
  return success(res, { total_sources: totalSources ?? null, total_charges: totalCharges ?? null });
}));

/** Photo du client : l'ancienne reste archivée en version antérieure (TR-05). */
router.post('/clients/:id/photo', can('kyc:CREATE', 'kyc:UPDATE'), upload.single('photo'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = await clientAccessible(req, id);
  const f = req.file;
  if (!f) throw new ErreurMetier('Photo requise', 400);
  if (!/^image\/(jpeg|png|webp)$/.test(f.mimetype)) throw new ErreurMetier('Format accepté : JPEG, PNG ou WebP.', 422);
  const url = `/uploads/${f.filename}`;

  const precedente = await prisma.pieceJointe.findFirst({ where: { clientId: id, categorie: 'photo_client', archiveAt: null }, orderBy: { version: 'desc' } });
  await prisma.$transaction(async (tx) => {
    if (precedente) await tx.pieceJointe.update({ where: { id: precedente.id }, data: { archiveAt: new Date() } });
    await tx.pieceJointe.create({
      data: { intitule: 'Photo du client', nomFichier: f.originalname, typeMime: f.mimetype, taille: f.size, url, categorie: 'photo_client', clientId: id, version: (precedente?.version ?? 0) + 1, remplaceId: precedente?.id ?? null },
    });
    await tx.client.update({ where: { id }, data: { photoUrl: url } });
  });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'kyc', action: 'UPDATE_PHOTO_CLIENT', entiteType: 'client', entiteId: id, description: `Photo de ${c.prenom ?? ''} ${c.nom} mise à jour` });
  return success(res, { photo_url: url });
}));

/**
 * Photo de l'activité professionnelle (compléments stratégiques, point 9) : distincte de la
 * photo du client, additive (une visite peut en ajouter plusieurs au fil du temps), toujours
 * géolocalisée et horodatée quand la position est disponible.
 */
router.get('/clients/:id/photos-activite', can('kyc:VIEW', 'credit:VIEW'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await clientAccessible(req, id);
  return success(res, await prisma.pieceJointe.findMany({ where: { clientId: id, categorie: 'photo_activite', archiveAt: null }, orderBy: { createdAt: 'desc' } }));
}));

router.post('/clients/:id/photos-activite', can('kyc:CREATE', 'kyc:UPDATE'), upload.single('photo'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = await clientAccessible(req, id);
  const f = req.file;
  if (!f) throw new ErreurMetier('Photo requise', 400);
  if (!/^image\/(jpeg|png|webp)$/.test(f.mimetype)) throw new ErreurMetier('Format accepté : JPEG, PNG ou WebP.', 422);
  const b = z.object({ latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional() }).parse(req.body);
  const url = `/uploads/${f.filename}`;
  const pj = await prisma.pieceJointe.create({
    data: {
      intitule: "Photo de l'activité professionnelle", nomFichier: f.originalname, typeMime: f.mimetype, taille: f.size, url,
      categorie: 'photo_activite', clientId: id, latitude: b.latitude ?? null, longitude: b.longitude ?? null, prisAt: new Date(),
    },
  });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'kyc', action: 'CREATE_PHOTO_ACTIVITE', entiteType: 'client', entiteId: id, description: `Photo d'activité ajoutée pour ${c.prenom ?? ''} ${c.nom}` });
  return success(res, pj);
}));

export default router;
