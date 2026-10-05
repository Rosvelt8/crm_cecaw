import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ReactNode } from 'react';

export default function EquipesLayout({ children }: { children: ReactNode }) {
  return <RoleGuard perm={['organisation:VIEW']}>{children}</RoleGuard>;
}
