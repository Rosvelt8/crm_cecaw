import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function RecouvrementLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['recouvrement:VIEW']}>{children}</RoleGuard>;
}
