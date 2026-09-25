import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './auth.controller';

const router = Router();

/** Freine le bourrage d'identifiants : par adresse IP, en plus du blocage de compte. */
const limiteConnexion = rateLimit({
  windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' },
});

router.post('/login', limiteConnexion, ctrl.login);
router.post('/refresh', ctrl.refreshToken);
router.post('/mfa/verifier', limiteConnexion, ctrl.verifierMfa);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.put('/me', authenticate, ctrl.updateMe);
router.put('/me/password', authenticate, ctrl.changePassword);
router.post('/mfa/preparer', authenticate, ctrl.preparerMfa);
router.post('/mfa/activer', authenticate, ctrl.activerMfa);
router.post('/mfa/desactiver', authenticate, ctrl.desactiverMfa);
router.get('/me/pin', authenticate, ctrl.etatPin);
router.put('/me/pin', authenticate, ctrl.definirPin);
router.post('/me/pin/verify', authenticate, ctrl.verifierPin);

export default router;
