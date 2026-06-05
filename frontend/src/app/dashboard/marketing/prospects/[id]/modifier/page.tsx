'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { prospectService } from '@/services/prospectService';
import ProspectForm, { type ProspectFormData, EMPTY_FORM } from '@/components/prospects/ProspectForm';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function ModifierProspectPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { isAgent, utilisateurId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [defaultValues, setDefaultValues] = useState<Partial<ProspectFormData> | null>(null);
  const [prospect, setProspect] = useState<any | null>(null);

  useEffect(() => {
    prospectService.getProspect(id).then((p) => {
      setProspect(p);
      setDefaultValues({
        prenom: p.prenom ?? '',
        nom: p.nom ?? '',
        genre: p.genre ?? '',
        dateNaissance: p.dateNaissance ?? '',
        lieuNaissance: p.lieuNaissance ?? '',
        nationalite: p.nationalite ?? 'Camerounaise',
        numeroCNI: p.numeroCni ?? p.numeroCNI ?? '',
        telephone: p.telephone ?? '',
        telephoneSecondaire: p.telephoneSecondaire ?? '',
        email: p.email ?? '',
        adresse: p.adresse ?? '',
        quartier: p.quartier ?? '',
        ville: p.ville ?? '',
        profession: p.profession ?? '',
        employeur: p.employeur ?? '',
        secteurActivite: p.secteurActivite ?? '',
        revenuMensuel: p.revenuMensuel ?? '',
        situationFamiliale: p.situationFamiliale ?? '',
        nombreEnfants: p.nombreEnfants ?? 0,
        referentNom: p.referentNom ?? '',
        referentTelephone: p.referentTelephone ?? '',
        referentRelation: p.referentRelation ?? '',
        statut: p.statut ?? 'nouveau',
        produitInteretId: p.produitInteretId ? String(p.produitInteretId) : '',
        commercialId: p.commercialId ? String(p.commercialId) : (p.commercial?.id ? String(p.commercial.id) : ''),
        notes: p.notes ?? '',
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        piecesJointes: [],
      });
    }).catch(() => {
      toast.error('Prospect introuvable');
      router.back();
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-32 text-center text-muted-foreground text-sm">Chargement…</div>;

  if (!defaultValues) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <p className="text-muted-foreground">Prospect introuvable.</p>
      <button className="text-sm underline text-brand-600" onClick={() => router.back()}>Retour</button>
    </div>
  );

  if (isAgent && prospect && String(prospect.commercialId ?? prospect.commercial?.id) !== utilisateurId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-muted-foreground">Accès refusé — ce prospect ne vous appartient pas.</p>
        <button className="text-sm underline text-brand-600" onClick={() => router.back()}>Retour</button>
      </div>
    );
  }

  const handleSubmit = async (data: ProspectFormData) => {
    if (!data.nom.trim() || !data.telephone.trim()) {
      toast.error('Nom et téléphone requis'); return;
    }
    setIsSubmitting(true);
    try {
      await prospectService.update(id, {
        ...data,
        commercialId: data.commercialId ? Number(data.commercialId) : null,
        produitInteretId: data.produitInteretId ? Number(data.produitInteretId) : null,
        piecesJointes: undefined,
      });
      toast.success('Prospect mis à jour');
      router.push('/dashboard/marketing/prospects');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la mise à jour');
      setIsSubmitting(false);
    }
  };

  return (
    <ProspectForm
      title={`Modifier — ${defaultValues.prenom} ${defaultValues.nom}`}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      lockedCommercialId={isAgent && utilisateurId ? utilisateurId : undefined}
    />
  );
}
