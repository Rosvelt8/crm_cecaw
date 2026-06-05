import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdminOrManager } from '../../middleware/rbac';
import * as ctrl from './groupes.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', isAdminOrManager, ctrl.create);
router.put('/:id', isAdminOrManager, ctrl.update);
router.delete('/:id', isAdminOrManager, ctrl.remove);

export default router;
