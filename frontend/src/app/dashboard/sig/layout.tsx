import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function SigLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['sig:VIEW', 'territoire:VIEW']}>{children}</RoleGuard>;
}
