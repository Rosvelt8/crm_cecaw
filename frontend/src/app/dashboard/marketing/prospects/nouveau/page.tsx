'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { prospectService } from '@/services/prospectService';
import ProspectForm, { type ProspectFormData } from '@/components/prospects/ProspectForm';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function NouveauProspectPage() {
  const router = useRouter();
  const { isAgent, utilisateurId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: ProspectFormData) => {
    if (!data.nom.trim() || !data.telephone.trim()) {
      toast.error('Nom et téléphone requis'); return;
    }
    setIsSubmitting(true);
    try {
      const commercialId = isAgent && utilisateurId ? utilisateurId : data.commercialId;
      await prospectService.create({
        ...data,
        commercialId: commercialId ? Number(commercialId) : null,
        produitInteretId: data.produitInteretId ? Number(data.produitInteretId) : null,
        piecesJointes: undefined,
      });
      toast.success(`Prospect ${data.prenom} ${data.nom} créé`);
      router.push('/dashboard/marketing/prospects');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la création');
      setIsSubmitting(false);
    }
  };

  return (
    <ProspectForm
      title="Nouveau prospect"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      defaultValues={isAgent && utilisateurId ? { commercialId: utilisateurId } : undefined}
      lockedCommercialId={isAgent && utilisateurId ? utilisateurId : undefined}
    />
  );
}
