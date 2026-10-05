import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function SegmentationLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['crm:VIEW']}>{children}</RoleGuard>;
}
