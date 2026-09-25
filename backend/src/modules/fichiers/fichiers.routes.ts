import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { existsSync } from 'fs';
import prisma from '../../lib/prisma';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { droitsEffectifs, ErreurMetier, rolesEffectifs } from '../../lib/rbac';

/**
 * Accès aux fichiers déposés (pièces d'identité, justificatifs, photos de visite, reçus).
 *
 * Aucun fichier n'est servi publiquement : chaque lecture exige un jeton valide, l'un des droits de
 * consultation du domaine concerné, et l'appartenance à l'agence du dossier auquel le fichier est
 * rattaché (les rôles transverses de conformité, d'audit et de direction voient tout le réseau).
 */

const DROITS_LECTURE = ['crm:VIEW', 'kyc:VIEW', 'credit:VIEW', 'tournees:VIEW', 'recouvrement:VIEW', 'documentaire:VIEW'];
const ROLES_RESEAU = ['R03', 'R06', 'R15'];

const router = Router();
router.use(authenticate);

router.get('/:nom', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // basename : aucun ../ ne peut sortir du dossier des dépôts.
    const nom = path.basename(req.params.nom);
    const pj = await prisma.pieceJointe.findFirst({
      where: { url: `/uploads/${nom}` },
      select: {
        nomFichier: true, typeMime: true,
        client: { select: { agenceId: true } }, prospect: { select: { commercial: { select: { agenceId: true } } } },
        dossierKyc: { select: { client: { select: { agenceId: true } }, prospect: { select: { commercial: { select: { agenceId: true } } } } } },
        demandeCredit: { select: { agenceId: true } }, visiteTournee: { select: { tournee: { select: { agenceId: true } } } },
      },
    });
    if (!pj) throw new ErreurMetier('Fichier introuvable', 404);

    const droits = await droitsEffectifs(req.user!.sub, req.user!.role);
    if (!DROITS_LECTURE.some((d) => droits.has(d))) throw new ErreurMetier('Accès refusé', 403);

    const agenceDuFichier = pj.client?.agenceId ?? pj.prospect?.commercial.agenceId ?? pj.dossierKyc?.client?.agenceId ?? pj.dossierKyc?.prospect?.commercial.agenceId
      ?? pj.demandeCredit?.agenceId ?? pj.visiteTournee?.tournee.agenceId ?? null;
    const roles = await rolesEffectifs(req.user!.sub, req.user!.role);
    const reseau = ROLES_RESEAU.some((r) => roles.has(r)) || req.user!.role === 'admin';
    if (!reseau && agenceDuFichier !== null && agenceDuFichier !== req.user!.agenceId) throw new ErreurMetier('Fichier introuvable', 404);

    const chemin = path.resolve(env.UPLOAD_DIR, nom);
    if (!chemin.startsWith(path.resolve(env.UPLOAD_DIR)) || !existsSync(chemin)) throw new ErreurMetier('Fichier introuvable', 404);

    res.setHeader('Content-Type', pj.typeMime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pj.nomFichier)}"`);
    // Empêche l'exécution de contenu actif si un fichier hostile avait été déposé.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
    return res.sendFile(chemin);
  } catch (e) { return next(e); }
});

export default router;
