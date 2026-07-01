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

const DEFAULT_PASSWORD = 'Cecaw2025!';

const DEMO_ACCOUNTS = [
  { email: 'admin@cecawfinance.com',      prenom: 'Super',   nom: 'Admin',    role: 'Administrateur' },
  { email: 'manager@cecawfinance.com',    prenom: 'Fatou',   nom: 'Manager',  role: 'Manager' },
  { email: 'backoffice@cecawfinance.com', prenom: 'Pierre',  nom: 'Backoff',  role: 'Back-office' },
  { email: 'agent1@cecawfinance.com',     prenom: 'Jean',    nom: 'Agent',    role: 'Agent Terrain' },
];

const ROLE_COLORS: Record<string, string> = {
  'Administrateur':  'bg-purple-100 text-purple-700',
  'Manager':         'bg-indigo-100 text-indigo-700',
  'Back-office':     'bg-teal-100 text-teal-700',
  'Agent Terrain':   'bg-green-100 text-green-700',
};

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const { setAuth } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const fillAccount = (email: string) => {
    setValue('email', email);
    setValue('password', DEFAULT_PASSWORD);
    setShowAccounts(false);
  };

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const { user, access_token, refresh_token } = await authService.login(data);
      setAuth(user, access_token, refresh_token);
      toast.success('Connexion réussie', { description: `Bienvenue, ${user.prenom} !` });
      router.replace(redirectTo);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Une erreur est survenue.';
      toast.error('Échec de connexion', { description: msg });
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="email">Email professionnel</label>
          <Input
            id="email"
            type="email"
            placeholder="nom@cecawfinance.com"
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

      {/* Comptes disponibles */}
      <div className="rounded-xl border border-dashed border-muted-foreground/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAccounts((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-sm font-medium hover:bg-muted/30 transition-colors flex-wrap"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            Comptes de démonstration
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono bg-muted rounded px-1.5 py-0.5">{DEFAULT_PASSWORD}</span>
            {showAccounts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </button>

        {showAccounts && (
          <div className="border-t divide-y">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fillAccount(acc.email)}
                className="w-full flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-muted/30 transition-colors text-left flex-wrap sm:flex-nowrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                    {acc.prenom[0]}{acc.nom[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{acc.prenom} {acc.nom}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{acc.email}</p>
                  </div>
                </div>
                <span className={cn('shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5', ROLE_COLORS[acc.role] ?? 'bg-slate-100 text-slate-600')}>
                  {acc.role}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
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
