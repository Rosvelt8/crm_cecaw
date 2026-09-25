import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import * as ctrl from './comptes.controller';

const router = Router();
router.use(authenticate);

// Standalone compte routes
router.get('/:id', can('comptes:VIEW', 'collecte:VIEW', 'crm:VIEW'), ctrl.getOne);
router.patch('/:id/statut', can('comptes:UPDATE'), ctrl.updateStatut);
router.patch('/:id/objectif-epargne', can('comptes:UPDATE', 'crm:UPDATE'), ctrl.definirObjectifEpargne);
router.get('/:id/analyse-epargne', can('comptes:VIEW', 'crm:VIEW'), ctrl.analyseEpargne);
router.get('/:compte_id/transactions', can('comptes:VIEW', 'collecte:VIEW', 'crm:VIEW'), ctrl.listTransactions);
router.post('/:compte_id/transactions', can('comptes:EXECUTE', 'collecte:EXECUTE', 'collecte:CREATE'), ctrl.createTransaction);
router.delete('/:id', can('comptes:UPDATE'), ctrl.remove);

export default router;
