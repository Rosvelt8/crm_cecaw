import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function SecuriteLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['securite:VIEW']}>{children}</RoleGuard>;
}
