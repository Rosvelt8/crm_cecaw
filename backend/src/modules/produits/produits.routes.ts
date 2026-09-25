import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import * as ctrl from './produits.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', can('produits:CONFIGURE'), ctrl.create);
router.put('/:id', can('produits:CONFIGURE'), ctrl.update);
router.patch('/:id/toggle', can('produits:CONFIGURE'), ctrl.toggle);
router.delete('/:id', can('produits:CONFIGURE'), ctrl.remove);

export default router;
