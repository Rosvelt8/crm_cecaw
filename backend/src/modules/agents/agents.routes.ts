import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import * as ctrl from './agents.controller';

const router = Router();
router.use(authenticate);
router.get('/terrain', ctrl.getTerrainAgents);
router.get('/', ctrl.list);
router.get('/trajets', ctrl.getTrajets);
router.get('/:id/trajet', ctrl.getTrajet);
router.get('/:id', ctrl.getOne);
router.post('/', can('organisation:UPDATE'), ctrl.create);
router.put('/:id', can('organisation:UPDATE'), ctrl.update);
router.patch('/:id/position', ctrl.updatePosition);
router.delete('/:id', can('organisation:UPDATE'), ctrl.remove);

export default router;
