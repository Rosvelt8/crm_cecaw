'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth, type AuthPerms } from '@/hooks/useAuth';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Redirect agents away — default true. Ignored when `permission` is set. */
  requireAdmin?: boolean;
  /** When set, gate access on this specific AuthPerms flag instead of the generic "not an agent" check. */
  permission?: keyof Pick<AuthPerms, 'canAccessParametres' | 'canAccessLogs' | 'canAccessStats'>;
}

export function RoleGuard({ children, requireAdmin = true, permission }: Props) {
  const auth = useAuth();
  const router = useRouter();
  // Les droits RBAC se chargent de façon asynchrone : tant qu'ils ne sont pas arrivés, un drapeau
  // `permission` vaudrait toujours faux et redirigerait à tort. `isAgent` vient du profil utilisateur,
  // déjà disponible dès la connexion, donc n'a pas besoin d'attendre `loaded`.
  const enAttente = Boolean(permission) && !auth.loaded;
  const blocked = !enAttente && (permission ? !auth[permission] : (requireAdmin && auth.isAgent));

  useEffect(() => {
    if (blocked) {
      router.replace('/dashboard');
    }
  }, [blocked, router]);

  if (enAttente) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
        <ShieldX className="h-14 w-14 text-red-300" />
        <p className="text-xl font-bold text-foreground">Accès restreint</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Vous n'avez pas les droits nécessaires pour accéder à cette section.
          Contactez votre administrateur.
        </p>
        <Button variant="outline" onClick={() => router.replace('/dashboard')}>
          Retour au tableau de bord
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
