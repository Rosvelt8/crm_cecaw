import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function RolesLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['securite:VIEW', 'socle:VIEW']}>{children}</RoleGuard>;
}
