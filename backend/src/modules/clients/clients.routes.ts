import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { upload } from '../../middleware/upload';
import * as ctrl from './clients.controller';
import { listByClient, create as createCompte } from '../comptes/comptes.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.patch('/:id/statut', ctrl.updateStatut);
router.delete('/:id', ctrl.remove);
router.post('/:id/pieces-jointes', upload.single('fichier'), ctrl.uploadPJ);
router.delete('/:id/pieces-jointes/:pj_id', ctrl.deletePJ);

// Nested comptes
router.get('/:client_id/comptes', listByClient);
router.post('/:client_id/comptes', createCompte);

export default router;
