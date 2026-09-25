import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import * as ctrl from './equipes.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', can('organisation:CREATE'), ctrl.create);
router.put('/:id', can('organisation:CREATE'), ctrl.update);
router.delete('/:id', can('organisation:CREATE'), ctrl.remove);

export default router;
