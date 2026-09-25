import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import * as ctrl from './objectifs.controller';

const router = Router();
router.use(authenticate);
router.post('/recalculer', can('objectifs:UPDATE'), async (_req, res, next) => { try { res.json({ success: true, data: await (await import('./objectifs.calcul')).recalculerObjectifs() }); } catch (e) { next(e); } });
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/projection', ctrl.projection);
router.post('/', can('objectifs:CREATE'), ctrl.create);
router.put('/:id', can('objectifs:UPDATE'), ctrl.update);
router.patch('/:id/realise', can('objectifs:UPDATE'), ctrl.updateRealise);
router.delete('/:id', can('objectifs:UPDATE'), ctrl.remove);

export default router;
