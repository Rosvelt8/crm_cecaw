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
        type_personne: data.typePersonne,
        nom: data.nom, prenom: data.prenom || undefined,
        genre: data.genre, date_naissance: data.dateNaissance || undefined,
        lieu_naissance: data.lieuNaissance || undefined, nationalite: data.nationalite || undefined,
        numero_cni: data.numeroCNI || undefined, nui: data.nui || undefined,
        forme_juridique: data.formeJuridique || undefined, sigle: data.sigle || undefined,
        rccm: data.rccm || undefined, capital_social: data.capitalSocial || undefined,
        telephone: data.telephone, telephone_secondaire: data.telephoneSecondaire || undefined,
        email: data.email || undefined,
        adresse: data.adresse || undefined, quartier: data.quartier || undefined, ville: data.ville || undefined,
        profession: data.profession || undefined, employeur: data.employeur || undefined,
        secteur_activite: data.secteurActivite || undefined, revenu_mensuel: data.revenuMensuel || undefined,
        situation_familiale: data.situationFamiliale, nombre_enfants: data.nombreEnfants,
        referent_nom: data.referentNom || undefined, referent_telephone: data.referentTelephone || undefined,
        referent_relation: data.referentRelation || undefined,
        statut: data.statut,
        produit_interet_id: data.produitInteretId ? Number(data.produitInteretId) : null,
        commercial_id: commercialId ? Number(commercialId) : undefined,
        notes: data.notes || undefined,
        latitude: data.latitude ?? undefined, longitude: data.longitude ?? undefined,
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
