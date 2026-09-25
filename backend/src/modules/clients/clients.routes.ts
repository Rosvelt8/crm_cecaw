import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { upload } from '../../middleware/upload';
import * as ctrl from './clients.controller';
import { listByClient, create as createCompte } from '../comptes/comptes.controller';

const router = Router();
router.use(authenticate);

// Routes fixes avant `/:id`.
router.get('/scores', can('crm:VIEW'), ctrl.listScores);
router.post('/scores/recalculer', can('crm:UPDATE'), ctrl.recalculerScores);

router.get('/', can('crm:VIEW'), ctrl.list);
router.get('/:id', can('crm:VIEW'), ctrl.getOne);
router.get('/:id/synthese', can('crm:VIEW'), ctrl.synthese);
router.post('/', can('crm:CREATE'), ctrl.create);
router.put('/:id', can('crm:UPDATE'), ctrl.update);
router.patch('/:id/statut', can('crm:UPDATE'), ctrl.updateStatut);
router.delete('/:id', can('crm:UPDATE'), ctrl.remove);
router.post('/:id/pieces-jointes', can('crm:UPDATE'), upload.single('fichier'), ctrl.uploadPJ);
router.delete('/:id/pieces-jointes/:pj_id', can('crm:UPDATE'), ctrl.deletePJ);

// Objectifs personnels du client (compléments stratégiques, point 13).
router.get('/:id/objectifs-personnels', can('crm:VIEW'), ctrl.listObjectifsClient);
router.post('/:id/objectifs-personnels', can('crm:CREATE', 'crm:UPDATE'), ctrl.creerObjectifClient);
router.put('/:id/objectifs-personnels/:objectif_id', can('crm:UPDATE'), ctrl.updateObjectifClient);

// Nested comptes
router.get('/:client_id/comptes', can('comptes:VIEW', 'collecte:VIEW', 'crm:VIEW'), listByClient);
router.post('/:client_id/comptes', can('comptes:CREATE', 'collecte:CREATE'), createCompte);

export default router;
