import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function SystemeLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['administration:VIEW']}>{children}</RoleGuard>;
}
