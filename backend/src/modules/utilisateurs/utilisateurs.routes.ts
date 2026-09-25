import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import * as ctrl from './utilisateurs.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', can('socle:CREATE'), ctrl.create);
router.put('/:id', can('socle:UPDATE'), ctrl.update);
router.patch('/:id/toggle', can('socle:UPDATE'), ctrl.toggle);
// Le manager peut réinitialiser le mot de passe des utilisateurs de sa propre agence (scoping dans le service).
router.post('/:id/reset-password', can('socle:EXECUTE'), ctrl.resetPassword);
router.put('/:id/password', can('socle:UPDATE'), ctrl.changePassword);
router.delete('/:id', can('socle:CREATE'), ctrl.remove);

export default router;
