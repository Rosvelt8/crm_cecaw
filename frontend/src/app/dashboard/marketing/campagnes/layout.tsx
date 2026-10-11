import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function CampagnesLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['communication:VIEW', 'crm:VIEW']}>{children}</RoleGuard>;
}
