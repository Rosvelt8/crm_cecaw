import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdminOrManager } from '../../middleware/rbac';
import * as ctrl from './produits.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', isAdminOrManager, ctrl.create);
router.put('/:id', isAdminOrManager, ctrl.update);
router.patch('/:id/toggle', isAdminOrManager, ctrl.toggle);
router.delete('/:id', isAdminOrManager, ctrl.remove);

export default router;
