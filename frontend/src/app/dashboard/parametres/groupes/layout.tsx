import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function GroupesLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['produits:VIEW', 'produits:CONFIGURE']}>{children}</RoleGuard>;
}
