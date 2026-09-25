import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { upload } from '../../middleware/upload';
import * as ctrl from './kyc.controller';
import clientRouter from './kyc.client';

const router = Router();
router.use(authenticate);

router.get('/dossiers', can('kyc:VIEW'), ctrl.lister);
router.post('/dossiers', can('kyc:CREATE'), ctrl.creer);
router.get('/dossiers/:id', can('kyc:VIEW'), ctrl.obtenir);
router.put('/dossiers/:id/controles/:cid', can('kyc:EXECUTE'), ctrl.evaluerControle);
router.post('/dossiers/:id/pieces-identite', can('kyc:CREATE', 'kyc:UPDATE'), upload.single('fichier'), ctrl.ajouterPieceIdentite);
router.post('/dossiers/:id/documents', can('kyc:CREATE', 'kyc:UPDATE'), upload.single('fichier'), ctrl.joindreDocument);
router.post('/dossiers/:id/soumettre', can('kyc:SUBMIT'), ctrl.soumettre);
router.post('/dossiers/:id/valider', can('kyc:APPROVE'), ctrl.valider);
router.post('/dossiers/:id/rejeter', can('kyc:REJECT'), ctrl.rejeter);
router.post('/dossiers/:id/rouvrir', can('kyc:CREATE', 'kyc:UPDATE'), ctrl.rouvrir);
router.post('/dossiers/:id/archiver', can('kyc:APPROVE'), ctrl.archiver);

router.use(clientRouter);

export default router;
