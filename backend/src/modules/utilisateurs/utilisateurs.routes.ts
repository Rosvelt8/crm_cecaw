import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdmin, isAdminOrManager } from '../../middleware/rbac';
import * as ctrl from './utilisateurs.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', isAdminOrManager, ctrl.create);
router.put('/:id', isAdminOrManager, ctrl.update);
router.patch('/:id/toggle', isAdminOrManager, ctrl.toggle);
router.post('/:id/reset-password', isAdmin, ctrl.resetPassword);
router.put('/:id/password', isAdmin, ctrl.changePassword);
router.delete('/:id', isAdmin, ctrl.remove);

export default router;
