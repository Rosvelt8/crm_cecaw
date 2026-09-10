import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdminOrManager } from '../../middleware/rbac';
import * as ctrl from './agents.controller';

const router = Router();
router.use(authenticate);
router.get('/terrain', ctrl.getTerrainAgents);
router.get('/', ctrl.list);
router.get('/:id/trajet', ctrl.getTrajet);
router.get('/:id', ctrl.getOne);
router.post('/', isAdminOrManager, ctrl.create);
router.put('/:id', isAdminOrManager, ctrl.update);
router.patch('/:id/position', ctrl.updatePosition);
router.delete('/:id', isAdminOrManager, ctrl.remove);

export default router;
