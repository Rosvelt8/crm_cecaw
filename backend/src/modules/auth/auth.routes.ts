import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './auth.controller';

const router = Router();

router.post('/login', ctrl.login);
router.post('/refresh', ctrl.refreshToken);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.put('/me', authenticate, ctrl.updateMe);
router.put('/me/password', authenticate, ctrl.changePassword);
router.get('/me/pin', authenticate, ctrl.etatPin);
router.put('/me/pin', authenticate, ctrl.definirPin);
router.post('/me/pin/verify', authenticate, ctrl.verifierPin);

export default router;
