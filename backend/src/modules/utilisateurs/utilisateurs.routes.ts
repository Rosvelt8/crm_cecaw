import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { isAdmin, isAdminOrManager } from '../../middleware/rbac';
import * as ctrl from './utilisateurs.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', isAdmin, ctrl.create);
router.put('/:id', isAdmin, ctrl.update);
router.patch('/:id/toggle', isAdmin, ctrl.toggle);
// Le manager peut réinitialiser le mot de passe des utilisateurs de sa propre agence (scoping dans le service).
router.post('/:id/reset-password', isAdminOrManager, ctrl.resetPassword);
router.put('/:id/password', isAdmin, ctrl.changePassword);
router.delete('/:id', isAdmin, ctrl.remove);

export default router;
