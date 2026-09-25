import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { upload } from '../../middleware/upload';
import * as ctrl from './credit.controller';

const router = Router();
router.use(authenticate);

// Ces routes sont déclarées avant `/:id` pour ne pas être capturées par lui.
router.post('/simulation', can('credit:VIEW'), ctrl.simuler);
router.post('/grille/apercu', can('analyse:VIEW'), ctrl.apercuGrille);

router.get('/', can('credit:VIEW'), ctrl.lister);
router.post('/', can('credit:CREATE'), ctrl.creer);
router.get('/:id', can('credit:VIEW'), ctrl.obtenir);
router.put('/:id', can('credit:CREATE', 'credit:UPDATE'), ctrl.modifier);
router.post('/:id/soumettre', can('credit:SUBMIT'), ctrl.soumettre);
router.post('/:id/annuler', can('credit:UPDATE'), ctrl.annuler);

router.post('/:id/garanties', can('credit:UPDATE'), ctrl.ajouterGarantie);
router.delete('/:id/garanties/:gid', can('credit:UPDATE'), ctrl.supprimerGarantie);
router.post('/:id/garants', can('credit:UPDATE'), ctrl.ajouterGarant);
router.delete('/:id/garants/:gid', can('credit:UPDATE'), ctrl.supprimerGarant);
router.post('/:id/visites', can('credit:UPDATE'), upload.array('photos', 5), ctrl.enregistrerVisite);

router.get('/:id/grille', can('analyse:VIEW'), ctrl.obtenirGrille);
router.put('/:id/grille', can('analyse:CREATE', 'analyse:UPDATE'), ctrl.sauvegarderGrille);
router.post('/:id/analyse/terminer', can('analyse:SUBMIT'), ctrl.terminerAnalyse);

router.post('/:id/decision', can('credit:APPROVE', 'credit:REJECT'), ctrl.decider);
router.post('/:id/contrat', can('credit:EXECUTE'), ctrl.editerContrat);
router.post('/:id/contrat/signer', can('credit:EXECUTE'), ctrl.signerContrat);
router.post('/:id/decaissement', can('credit:EXECUTE'), ctrl.decaisser);
router.get('/:id/echeances', can('credit:VIEW'), ctrl.listerEcheances);
router.post('/:id/remboursements', can('credit:EXECUTE'), ctrl.enregistrerRemboursement);
router.post('/:id/avenants', can('credit:APPROVE'), ctrl.creerAvenant);

export default router;
