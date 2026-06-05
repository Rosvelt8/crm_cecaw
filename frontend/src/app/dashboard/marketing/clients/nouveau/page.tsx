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
        commercialId: p.commercialId ? String(p.commercialId) : (p.commercial?.id ? String(p.commercial.id) : ''),
        statut: 'actif',
        notes: p.notes ?? '',
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
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
        ...data,
        prospectId: prospectId ? Number(prospectId) : null,
        commercialId: commercialId ? Number(commercialId) : null,
        agenceId: data.agenceId ? Number(data.agenceId) : null,
        piecesJointes: undefined,
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
