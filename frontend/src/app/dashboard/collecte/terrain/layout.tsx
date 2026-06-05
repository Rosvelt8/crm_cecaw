import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function TerrainLayout({ children }: { children: ReactNode }) {
  return <RoleGuard>{children}</RoleGuard>;
}
