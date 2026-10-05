import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['integration:VIEW']}>{children}</RoleGuard>;
}
