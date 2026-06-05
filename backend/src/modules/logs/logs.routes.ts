import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdminOrManager } from '../../middleware/rbac';
import * as ctrl from './logs.controller';

const router = Router();
router.use(authenticate, isAdminOrManager);
router.get('/', ctrl.list);

export default router;
