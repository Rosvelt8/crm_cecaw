import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function FinancierLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['produits:VIEW']}>{children}</RoleGuard>;
}
