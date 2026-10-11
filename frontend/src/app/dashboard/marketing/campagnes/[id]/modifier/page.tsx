'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { EnTete } from '@/components/ui/kpi';
import { CampagneForm } from '@/components/campagnes/CampagneForm';
import { campagnesApi } from '@/services/metierService';
import { msg } from '@/lib/apiHelpers';

export default function ModifierCampagnePage() {
  const { id } = useParams<{ id: string }>();
  const [campagne, setCampagne] = useState<unknown>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => { campagnesApi.obtenir(id).then(setCampagne).catch((e) => setErreur(msg(e, 'Campagne introuvable'))); }, [id]);

  return (
    <RoleGuard perm={['communication:CONFIGURE']}>
      <div className="space-y-4">
        <EnTete titre="Modifier la campagne" />
        {erreur ? <p className="text-sm text-destructive">{erreur}</p> : !campagne ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : <CampagneForm initiale={campagne} />}
      </div>
    </RoleGuard>
  );
}
