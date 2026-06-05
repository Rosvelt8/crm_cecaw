import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes';
import agencesRouter from '../modules/agences/agences.routes';
import equipesRouter from '../modules/equipes/equipes.routes';
import groupesRouter from '../modules/groupes-produits/groupes.routes';
import produitsRouter from '../modules/produits/produits.routes';
import utilisateursRouter from '../modules/utilisateurs/utilisateurs.routes';
import agentsRouter from '../modules/agents/agents.routes';
import prospectsRouter from '../modules/prospects/prospects.routes';
import clientsRouter from '../modules/clients/clients.routes';
import comptesRouter from '../modules/comptes/comptes.routes';
import objectifsRouter from '../modules/objectifs/objectifs.routes';
import statsRouter from '../modules/stats/stats.routes';
import logsRouter from '../modules/logs/logs.routes';
import dashboardRouter from '../modules/dashboard/dashboard.routes';
import testRouter from '../modules/test/test.routes';

const router = Router();

router.use('/auth', authRouter);
router.use('/agences', agencesRouter);
router.use('/equipes', equipesRouter);
router.use('/groupes-produits', groupesRouter);
router.use('/produits', produitsRouter);
router.use('/utilisateurs', utilisateursRouter);
router.use('/agents', agentsRouter);
router.use('/prospects', prospectsRouter);
router.use('/clients', clientsRouter);
router.use('/comptes', comptesRouter);
router.use('/objectifs', objectifsRouter);
router.use('/stats', statsRouter);
router.use('/logs', logsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/test', testRouter);

export default router;
