import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function AgencesLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['organisation:VIEW']}>{children}</RoleGuard>;
}
