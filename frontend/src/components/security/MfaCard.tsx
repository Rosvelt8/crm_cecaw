'use client';
/* eslint-disable react/no-unescaped-entities */

import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/stores/useAuthStore';
import { msg } from '@/lib/apiHelpers';

/** Activation et désactivation de l'authentification à deux facteurs (TOTP) de l'utilisateur connecté. */
export default function MfaCard() {
  const { user, setUser } = useAuthStore();
  const actif = Boolean((user as { mfa_actif?: boolean } | null)?.mfa_actif);
  const [config, setConfig] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [code, setCode] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [occupe, setOccupe] = useState(false);

  const maj = (mfa_actif: boolean) => { if (user) setUser({ ...user, mfa_actif } as typeof user); };

  const preparer = async () => {
    setOccupe(true);
    try { setConfig(await authService.mfaPreparer()); setCode(''); }
    catch (e) { toast.error(msg(e, 'Configuration impossible')); }
    finally { setOccupe(false); }
  };

  const activer = async () => {
    setOccupe(true);
    try { await authService.mfaActiver(code); toast.success('Authentification à deux facteurs activée'); setConfig(null); setCode(''); maj(true); }
    catch (e) { toast.error(msg(e, 'Code incorrect')); }
    finally { setOccupe(false); }
  };

  const desactiver = async () => {
    setOccupe(true);
    try { await authService.mfaDesactiver(motDePasse, code); toast.success('Authentification à deux facteurs désactivée'); setCode(''); setMotDePasse(''); maj(false); }
    catch (e) { toast.error(msg(e, 'Désactivation impossible')); }
    finally { setOccupe(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Authentification à deux facteurs
          <Badge variant={actif ? 'success' : 'outline'}>{actif ? 'Active' : 'Inactive'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!actif && !config && (
          <>
            <p className="text-muted-foreground">Ajoute un code à usage unique (application Google Authenticator, Microsoft Authenticator, Authy…) à votre mot de passe.</p>
            <Button variant="brand" size="sm" onClick={preparer} disabled={occupe}><KeyRound className="h-4 w-4 mr-1.5" />Activer</Button>
          </>
        )}
        {!actif && config && (
          <div className="space-y-3">
            <p>1. Dans votre application d'authentification, ajoutez un compte et saisissez cette clé :</p>
            <p className="rounded-md bg-muted p-2 font-mono text-sm break-all select-all">{config.secret}</p>
            <p className="text-xs text-muted-foreground">Sur téléphone, vous pouvez aussi ouvrir directement <a className="text-brand-700 underline" href={config.otpauth_url}>ce lien</a>.</p>
            <p>2. Saisissez le code à 6 chiffres affiché pour confirmer :</p>
            <div className="flex gap-2">
              <Input inputMode="numeric" maxLength={6} className="w-36 font-mono tracking-widest" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button variant="brand" size="sm" disabled={occupe || code.length !== 6} onClick={activer}>Confirmer</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfig(null)}>Annuler</Button>
            </div>
          </div>
        )}
        {actif && (
          <div className="space-y-2">
            <p className="text-muted-foreground">Pour désactiver, confirmez avec votre mot de passe et un code actuel.</p>
            <div className="flex flex-wrap gap-2">
              <Input type="password" className="w-52" placeholder="Mot de passe" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
              <Input inputMode="numeric" maxLength={6} className="w-32 font-mono tracking-widest" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button variant="destructive" size="sm" disabled={occupe || code.length !== 6 || !motDePasse} onClick={desactiver}>Désactiver</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
