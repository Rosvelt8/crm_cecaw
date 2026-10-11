'use client';

import { RoleGuard } from '@/components/auth/RoleGuard';
import { EnTete } from '@/components/ui/kpi';
import { CampagneForm } from '@/components/campagnes/CampagneForm';

export default function NouvelleCampagnePage() {
  return (
    <RoleGuard perm={['communication:CONFIGURE']}>
      <div className="space-y-4">
        <EnTete titre="Nouvelle campagne" sousTitre="La campagne est créée en brouillon : équipe, personnes ciblées et objectifs se complètent ensuite depuis sa fiche." />
        <CampagneForm />
      </div>
    </RoleGuard>
  );
}
