import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function AnalytiqueLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['analytique:VIEW']}>{children}</RoleGuard>;
}
