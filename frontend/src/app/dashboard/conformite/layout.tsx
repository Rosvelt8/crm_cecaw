import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function ConformiteLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['conformite:VIEW']}>{children}</RoleGuard>;
}
