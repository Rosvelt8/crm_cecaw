import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { upload } from '../../middleware/upload';
import * as ctrl from './prospects.controller';

const router = Router();
router.use(authenticate);
router.get('/', can('crm:VIEW'), ctrl.list);
router.get('/:id', can('crm:VIEW'), ctrl.getOne);
router.post('/', can('crm:CREATE'), ctrl.create);
router.put('/:id', can('crm:UPDATE'), ctrl.update);
router.patch('/:id/statut', can('crm:UPDATE'), ctrl.updateStatut);
router.delete('/:id', can('crm:UPDATE'), ctrl.remove);
router.post('/:id/pieces-jointes', can('crm:UPDATE'), upload.single('fichier'), ctrl.uploadPJ);
router.delete('/:id/pieces-jointes/:pj_id', can('crm:UPDATE'), ctrl.deletePJ);

export default router;
