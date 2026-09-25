import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import * as ctrl from './stats.controller';

const router = Router();
// Les agents terrain ont le droit de consulter leurs indicateurs, pas ceux des équipes.
const sansAgentTerrain = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) =>
  req.user?.role === 'agent' ? res.status(403).json({ success: false, message: 'Accès refusé' }) : next();
router.use(authenticate);
// Chefs d'équipe (backoffice) ne voient que la performance de leur propre équipe.
router.get('/performances/equipes', can('analytique:VIEW'), sansAgentTerrain, ctrl.getPerformancesEquipes);
// Statistiques globales/agence : réservées à admin/manager.
router.get('/kpis', can('analytique:EXPORT'), sansAgentTerrain, ctrl.getKpis);
router.get('/performances/individuelles', can('analytique:EXPORT'), sansAgentTerrain, ctrl.getPerformancesIndividuelles);
router.get('/transactions/par-mois', can('analytique:EXPORT'), sansAgentTerrain, ctrl.getTransactionsParMois);
router.get('/prospects/par-statut', can('analytique:EXPORT'), sansAgentTerrain, ctrl.getProspectsParStatut);

export default router;
