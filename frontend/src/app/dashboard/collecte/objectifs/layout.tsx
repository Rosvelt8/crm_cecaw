import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function CollecteObjectifsLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['objectifs:VIEW']}>{children}</RoleGuard>;
}
