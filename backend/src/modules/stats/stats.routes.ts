import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdminOrManager, isAdminManagerOrBackoffice } from '../../middleware/rbac';
import * as ctrl from './stats.controller';

const router = Router();
router.use(authenticate);
// Chefs d'équipe (backoffice) ne voient que la performance de leur propre équipe.
router.get('/performances/equipes', isAdminManagerOrBackoffice, ctrl.getPerformancesEquipes);
// Statistiques globales/agence : réservées à admin/manager.
router.get('/kpis', isAdminOrManager, ctrl.getKpis);
router.get('/performances/individuelles', isAdminOrManager, ctrl.getPerformancesIndividuelles);
router.get('/transactions/par-mois', isAdminOrManager, ctrl.getTransactionsParMois);
router.get('/prospects/par-statut', isAdminOrManager, ctrl.getProspectsParStatut);

export default router;
