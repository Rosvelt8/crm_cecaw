import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function CreditsLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['credit:VIEW']}>{children}</RoleGuard>;
}
