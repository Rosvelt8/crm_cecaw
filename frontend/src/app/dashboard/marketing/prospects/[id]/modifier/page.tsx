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
        typePersonne: p.typePersonne ?? 'physique',
        prenom: p.prenom ?? '',
        nom: p.nom ?? '',
        genre: p.genre && p.genre !== 'VIDE' ? p.genre : '',
        dateNaissance: p.dateNaissance ?? '',
        lieuNaissance: p.lieuNaissance ?? '',
        nationalite: p.nationalite ?? 'Camerounaise',
        numeroCNI: p.numeroCni ?? p.numeroCNI ?? '',
        nui: p.nui ?? '',
        sigle: p.sigle ?? '',
        formeJuridique: p.formeJuridique ?? '',
        rccm: p.rccm ?? '',
        capitalSocial: p.capitalSocial ?? '',
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
        situationFamiliale: p.situationFamiliale && p.situationFamiliale !== 'VIDE' ? p.situationFamiliale : '',
        nombreEnfants: p.nombreEnfants ?? 0,
        referentNom: p.referentNom ?? '',
        referentTelephone: p.referentTelephone ?? '',
        referentRelation: p.referentRelation ?? '',
        statut: p.statut ?? 'nouveau',
        produitInteretId: p.produitInteretId ? String(p.produitInteretId) : '',
        commercialId: p.commercialId ? String(p.commercialId) : (p.commercial?.id ? String(p.commercial.id) : ''),
        notes: p.notes ?? '',
        latitude: p.latitude != null ? Number(p.latitude) : null,
        longitude: p.longitude != null ? Number(p.longitude) : null,
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
        commercial_id: data.commercialId ? Number(data.commercialId) : undefined,
        notes: data.notes || undefined,
        latitude: data.latitude ?? undefined, longitude: data.longitude ?? undefined,
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
