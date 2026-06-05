import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './comptes.controller';

const router = Router();
router.use(authenticate);

// Standalone compte routes
router.get('/:id', ctrl.getOne);
router.patch('/:id/statut', ctrl.updateStatut);
router.get('/:compte_id/transactions', ctrl.listTransactions);
router.post('/:compte_id/transactions', ctrl.createTransaction);

export default router;
