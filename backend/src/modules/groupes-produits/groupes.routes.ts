import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdmin } from '../../middleware/rbac';
import * as ctrl from './groupes.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', isAdmin, ctrl.create);
router.put('/:id', isAdmin, ctrl.update);
router.delete('/:id', isAdmin, ctrl.remove);

export default router;
