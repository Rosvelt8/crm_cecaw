import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import * as ctrl from './logs.controller';

const router = Router();
router.use(authenticate, can('socle:VIEW', 'socle:AUDIT', 'conformite:AUDIT'));
router.get('/', ctrl.list);

export default router;
