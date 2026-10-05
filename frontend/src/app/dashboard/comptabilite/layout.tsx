import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function ComptabiliteLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['comptabilite:VIEW']}>{children}</RoleGuard>;
}
