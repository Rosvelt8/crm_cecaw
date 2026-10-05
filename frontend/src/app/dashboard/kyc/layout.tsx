import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function KycLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['kyc:VIEW']}>{children}</RoleGuard>;
}
