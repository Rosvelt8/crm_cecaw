import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function StatistiquesLayout({ children }: { children: ReactNode }) {
  return <RoleGuard>{children}</RoleGuard>;
}
