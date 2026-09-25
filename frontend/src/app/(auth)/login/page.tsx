'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/useAuthStore';
import { authService } from '@/services/authService';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, Lock, Eye, EyeOff, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginFormValues = z.infer<typeof loginSchema>;



const ROLE_COLORS: Record<string, string> = {
  'Administrateur':  'bg-purple-100 text-purple-700',
  'Manager':         'bg-indigo-100 text-indigo-700',
  'Back-office':     'bg-teal-100 text-teal-700',
  'Agent Terrain':   'bg-green-100 text-green-700',
};

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Deuxième étape : code de l'application d'authentification.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const { setAuth } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

 
  const terminer = (user: { prenom: string }, access: string, refresh: string, rappelMfa = false) => {
    setAuth(user as never, access, refresh);
    toast.success('Connexion réussie', { description: `Bienvenue, ${user.prenom} !` });
    if (rappelMfa) toast.info("Activez l'authentification à deux facteurs", { description: 'Depuis votre profil, pour renforcer la sécurité de votre compte.', duration: 8000 });
    router.replace(redirectTo);
  };

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const r = await authService.login(data);
      if (r.requires_mfa) { setMfaToken(r.mfa_token); return; }
      terminer(r.user, r.access_token, r.refresh_token, r.mfa_configuration_requise);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Une erreur est survenue.';
      toast.error('Échec de connexion', { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const verifier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setIsLoading(true);
    try {
      const r = await authService.verifierMfa(mfaToken, code);
      terminer(r.user, r.access_token, r.refresh_token);
    } catch (err: any) {
      toast.error('Code refusé', { description: err?.response?.data?.message ?? 'Code incorrect.' });
      // Jeton expiré ou compte bloqué : retour à la saisie des identifiants.
      if ([401, 423].includes(err?.response?.status) && /expir|bloqu/i.test(err?.response?.data?.message ?? '')) setMfaToken(null);
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Connexion</h1>
        <p className="text-muted-foreground text-sm">
          Entrez vos identifiants pour accéder à votre espace de travail.
        </p>
      </div>

      {mfaToken ? (
        <form onSubmit={verifier} className="space-y-4">
          <p className="text-sm text-muted-foreground">Saisissez le code à 6 chiffres affiché par votre application d'authentification.</p>
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="000000" className="text-center text-xl tracking-[0.5em] font-mono" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button type="submit" className="w-full h-11" variant="brand" loading={isLoading} disabled={code.length !== 6}>Vérifier</Button>
          <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground" onClick={() => { setMfaToken(null); setCode(''); }}>Retour</button>
        </form>
      ) : (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="email">Email professionnel</label>
          <Input
            id="email"
            type="email"
            placeholder="nom@cecaw.cm"
            icon={<Mail className="h-4 w-4" />}
            error={!!errors.email}
            autoComplete="email"
            {...register('email')}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="password">Mot de passe</label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              icon={<Lock className="h-4 w-4" />}
              error={!!errors.password}
              autoComplete="current-password"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full h-11" variant="brand" loading={isLoading}>
          Se connecter
        </Button>
      </form>
      )}

     
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
