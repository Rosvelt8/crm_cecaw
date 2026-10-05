import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function TourneesLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['tournees:VIEW']}>{children}</RoleGuard>;
}
