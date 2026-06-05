import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdminOrManager } from '../../middleware/rbac';
import * as ctrl from './stats.controller';

const router = Router();
router.use(authenticate, isAdminOrManager);
router.get('/kpis', ctrl.getKpis);
router.get('/performances/individuelles', ctrl.getPerformancesIndividuelles);
router.get('/performances/equipes', ctrl.getPerformancesEquipes);
router.get('/transactions/par-mois', ctrl.getTransactionsParMois);
router.get('/prospects/par-statut', ctrl.getProspectsParStatut);

export default router;
