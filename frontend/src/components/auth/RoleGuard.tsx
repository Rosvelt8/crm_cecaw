'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth, type AuthPerms } from '@/hooks/useAuth';
import { useCan } from '@/hooks/useCan';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Redirect agents away — default true. Ignored when `permission` or `perm` is set. */
  requireAdmin?: boolean;
  /** When set, gate access on this specific AuthPerms flag instead of the generic "not an agent" check. */
  permission?: keyof Pick<AuthPerms, 'canAccessParametres' | 'canAccessLogs' | 'canAccessStats'>;
  /** Accès accordé dès que l'utilisateur possède au moins un de ces droits RBAC (`domaine:VERBE`). Même
   *  logique que le filtrage `perm` des entrées de Sidebar.tsx : la page doit refuser exactement ce
   *  que le menu cache, pas seulement le cacher visuellement. */
  perm?: string[];
}

export function RoleGuard({ children, requireAdmin = true, permission, perm }: Props) {
  const auth = useAuth();
  const { can, loaded: droitsCharges } = useCan();
  const router = useRouter();
  // Les droits RBAC se chargent de façon asynchrone : tant qu'ils ne sont pas arrivés, un contrôle
  // basé dessus vaudrait toujours faux et redirigerait à tort. `isAgent` vient du profil utilisateur,
  // déjà disponible dès la connexion, donc n'a pas besoin d'attendre `loaded`.
  const enAttente = Boolean(permission || perm) && !droitsCharges;
  const blocked = !enAttente && (
    perm ? !can(...perm)
      : permission ? !auth[permission]
      : (requireAdmin && auth.isAgent)
  );

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
