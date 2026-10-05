import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function ProspectsLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['crm:VIEW']}>{children}</RoleGuard>;
}
