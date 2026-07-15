'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clientService } from '@/services/clientService';
import { prospectService } from '@/services/prospectService';
import ClientForm, { type ClientFormData } from '@/components/clients/ClientForm';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

function NouveauClientContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prospectId = searchParams.get('prospectId');
  const { isAgent, utilisateurId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [defaultValues, setDefaultValues] = useState<Partial<ClientFormData>>({});
  const [loadingProspect, setLoadingProspect] = useState(!!prospectId);

  useEffect(() => {
    if (!prospectId) return;
    prospectService.getProspect(prospectId).then((p) => {
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
        commercialId: p.commercialId ? String(p.commercialId) : (p.commercial?.id ? String(p.commercial.id) : ''),
        statut: 'actif',
        notes: p.notes ?? '',
        latitude: p.latitude != null ? Number(p.latitude) : null,
        longitude: p.longitude != null ? Number(p.longitude) : null,
        piecesJointes: [],
      });
    }).catch(() => toast.error('Impossible de charger le prospect'))
    .finally(() => setLoadingProspect(false));
  }, [prospectId]);

  if (loadingProspect) return <div className="py-32 text-center text-muted-foreground text-sm">Chargement…</div>;

  const handleSubmit = async (data: ClientFormData) => {
    if (!data.nom.trim() || !data.telephone.trim()) { toast.error('Nom et téléphone requis'); return; }
    setIsSubmitting(true);
    try {
      const commercialId = isAgent && utilisateurId ? utilisateurId : data.commercialId;
      await clientService.create({
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
        prospect_id: prospectId ? Number(prospectId) : undefined,
        commercial_id: commercialId ? Number(commercialId) : undefined,
        agence_id: data.agenceId ? Number(data.agenceId) : undefined,
        notes: data.notes || undefined,
        latitude: data.latitude ?? undefined, longitude: data.longitude ?? undefined,
      });
      if (prospectId) {
        await prospectService.updateStatut(Number(prospectId), 'converti');
      }
      toast.success(`Client ${data.prenom} ${data.nom} créé`);
      router.push('/dashboard/marketing/clients');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la création');
      setIsSubmitting(false);
    }
  };

  const lockedCommercialId = isAgent && utilisateurId ? utilisateurId : undefined;

  return (
    <ClientForm
      title={prospectId ? 'Convertir en client' : 'Nouveau client'}
      subtitle={prospectId ? 'Données pré-remplies depuis la fiche prospect. Vérifiez et complétez.' : 'Fiche KYC complète du client.'}
      defaultValues={lockedCommercialId ? { ...defaultValues, commercialId: lockedCommercialId } : defaultValues}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      lockedCommercialId={lockedCommercialId}
    />
  );
}

export default function NouveauClientPage() {
  return (
    <Suspense fallback={null}>
      <NouveauClientContent />
    </Suspense>
  );
}
