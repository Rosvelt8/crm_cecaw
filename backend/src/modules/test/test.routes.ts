import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { isAdminOrManager } from '../../middleware/rbac';
import { sendBienvenue, sendResetPassword, sendBienvenueClient } from '../../lib/mailer';
import { success } from '../../lib/response';
import { env } from '../../config/env';

const router = Router();
router.use(authenticate, isAdminOrManager);

const schema = z.object({
  to: z.string().email(),
  type: z.enum(['bienvenue', 'reset_password', 'bienvenue_client']).default('bienvenue'),
});

router.post('/mail', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { to, type } = schema.parse(req.body);

    if (!env.SMTP_HOST) {
      return res.status(503).json({
        success: false,
        message: 'SMTP non configuré — définissez SMTP_HOST dans le .env',
      });
    }

    const now = new Date().toLocaleString('fr-FR');

    if (type === 'bienvenue') {
      await sendBienvenue({
        to,
        prenom: 'Test',
        nom: 'Utilisateur',
        email: to,
        motDePasse: 'Test1234!',
        role: 'agent',
      });
    } else if (type === 'reset_password') {
      await sendResetPassword({
        to,
        prenom: 'Test',
        nom: 'Utilisateur',
        motDePasse: 'NouveauPass456!',
      });
    } else {
      await sendBienvenueClient({
        to,
        prenom: 'Test',
        nom: 'Client',
        agence: 'Agence Test',
      });
    }

    return success(res, {
      sent_to: to,
      type,
      smtp_host: env.SMTP_HOST,
      sent_at: now,
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ success: false, message: err.errors });
    }
    next(err);
  }
});

export default router;
