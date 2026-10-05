import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function CommunicationLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['communication:VIEW']}>{children}</RoleGuard>;
}
