import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function UtilisateursLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['socle:VIEW']}>{children}</RoleGuard>;
}
