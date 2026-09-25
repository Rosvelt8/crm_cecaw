import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';
import { DEFAUTS, definirParametre, reinitialiserParametre, tousLesParametres } from '../../lib/parametres';
import { etatTaches, executerTache } from '../../lib/planificateur';
import { listerSauvegardes, sauvegarder, verifierSauvegardes } from '../../lib/sauvegarde';
import { reinitialiserEchecs } from '../auth/mfa.service';
import { reinitialiserMfaAdmin } from '../auth/mfa.service';
import { smsConfigure } from '../../lib/sms';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const journal = (req: Request, module: 'parametres' | 'securite', action: string, type: string, id: number, description: string) =>
  createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module, action, entiteType: type, entiteId: id, description });

// ─── Administration générale : paramètres système et tâches ──────────────────
export const administrationRouter = Router();
administrationRouter.use(authenticate);

administrationRouter.get('/parametres', can('administration:VIEW'), wrap(async (_req, res) => success(res, await tousLesParametres())));

administrationRouter.put('/parametres/:cle', can('administration:CONFIGURE'), wrap(async (req, res) => {
  const cle = req.params.cle;
  if (!DEFAUTS[cle]) throw new ErreurMetier(`Paramètre inconnu : ${cle}`, 404);
  const { valeur } = z.object({ valeur: z.unknown() }).parse(req.body);
  const avant = (await tousLesParametres()).find((p) => p.cle === cle)?.valeur;
  await definirParametre(cle, valeur, req.user!.sub);
  await journal(req, 'parametres', 'UPDATE_PARAMETRE', 'parametre', 0, `${cle} : ${JSON.stringify(avant)} -> ${JSON.stringify(valeur)}`);
  return success(res, { cle, valeur });
}));

administrationRouter.delete('/parametres/:cle', can('administration:CONFIGURE'), wrap(async (req, res) => {
  if (!DEFAUTS[req.params.cle]) throw new ErreurMetier(`Paramètre inconnu : ${req.params.cle}`, 404);
  await reinitialiserParametre(req.params.cle);
  await journal(req, 'parametres', 'RESET_PARAMETRE', 'parametre', 0, `${req.params.cle} remis à sa valeur par défaut`);
  return success(res, { cle: req.params.cle, valeur: DEFAUTS[req.params.cle].valeur });
}));

administrationRouter.get('/taches', can('administration:VIEW'), wrap(async (_req, res) => success(res, await etatTaches())));

administrationRouter.post('/taches/:nom/executer', can('administration:CONFIGURE'), wrap(async (req, res) => {
  const r = await executerTache(req.params.nom, true);
  await journal(req, 'parametres', 'EXECUTION_TACHE', 'tache', 0, `Exécution manuelle de « ${req.params.nom} »`);
  return success(res, r);
}));

// ─── Sécurité : comptes, MFA, sauvegardes ────────────────────────────────────
export const securiteRouter = Router();
securiteRouter.use(authenticate);

securiteRouter.get('/etat', can('securite:VIEW'), wrap(async (_req, res) => {
  const maintenant = new Date();
  const [total, mfa, bloques, sauvegardes] = await Promise.all([
    prisma.utilisateur.count({ where: { actif: true } }),
    prisma.utilisateur.count({ where: { actif: true, mfaActif: true } }),
    prisma.utilisateur.count({ where: { bloqueJusquA: { gt: maintenant } } }),
    listerSauvegardes(),
  ]);
  return success(res, {
    utilisateurs_actifs: total, mfa_actifs: mfa, taux_mfa_pct: total ? Math.round((mfa / total) * 100) : 0, comptes_bloques: bloques,
    derniere_sauvegarde: sauvegardes[0] ?? null, nb_sauvegardes: sauvegardes.length,
    sauvegarde_planifiee: process.env.BACKUP_ENABLED === 'true', chiffrement_configure: Boolean(process.env.DATA_ENCRYPTION_KEY), sms_configure: smsConfigure(),
  });
}));

securiteRouter.get('/utilisateurs', can('securite:VIEW'), wrap(async (_req, res) => {
  const u = await prisma.utilisateur.findMany({ orderBy: { nom: 'asc' }, select: { id: true, nom: true, prenom: true, email: true, actif: true, role: true, mfaActif: true, tentativesEchouees: true, bloqueJusquA: true } });
  return success(res, u);
}));

securiteRouter.post('/utilisateurs/:id/debloquer', can('securite:CONFIGURE'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await reinitialiserEchecs(id);
  await journal(req, 'securite', 'DEBLOCAGE_COMPTE', 'utilisateur', id, `Compte #${id} débloqué`);
  return success(res, { debloque: true });
}));

securiteRouter.post('/utilisateurs/:id/reinitialiser-mfa', can('securite:CONFIGURE'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await reinitialiserMfaAdmin(id, req.user!);
  return success(res, { reinitialise: true });
}));

securiteRouter.get('/sauvegardes', can('securite:VIEW'), wrap(async (_req, res) => success(res, await listerSauvegardes())));

securiteRouter.post('/sauvegardes/verifier', can('securite:VIEW'), wrap(async (_req, res) => success(res, await verifierSauvegardes())));

securiteRouter.post('/sauvegardes', can('securite:CONFIGURE'), wrap(async (req, res) => {
  const s = await sauvegarder().catch((e: Error) => { throw new ErreurMetier(e.message, 500); });
  await journal(req, 'securite', 'SAUVEGARDE', 'sauvegarde', 0, `Sauvegarde ${s.fichier} (${s.taille} octets)`);
  return success(res, s);
}));
