import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './dashboard.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.getDashboard);

export default router;
