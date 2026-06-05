'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { clientService } from '@/services/clientService';
import ClientForm, { type ClientFormData } from '@/components/clients/ClientForm';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function ModifierClientPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { isAgent, utilisateurId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [defaultValues, setDefaultValues] = useState<Partial<ClientFormData> | null>(null);
  const [client, setClient] = useState<any | null>(null);

  useEffect(() => {
    clientService.getClient(id).then((c) => {
      setClient(c);
      setDefaultValues({
        prenom: c.prenom ?? '',
        nom: c.nom ?? '',
        genre: c.genre ?? '',
        dateNaissance: c.dateNaissance ?? '',
        lieuNaissance: c.lieuNaissance ?? '',
        nationalite: c.nationalite ?? 'Camerounaise',
        numeroCNI: c.numeroCni ?? c.numeroCNI ?? '',
        telephone: c.telephone ?? '',
        telephoneSecondaire: c.telephoneSecondaire ?? '',
        email: c.email ?? '',
        adresse: c.adresse ?? '',
        quartier: c.quartier ?? '',
        ville: c.ville ?? '',
        profession: c.profession ?? '',
        employeur: c.employeur ?? '',
        secteurActivite: c.secteurActivite ?? '',
        revenuMensuel: c.revenuMensuel ?? '',
        situationFamiliale: c.situationFamiliale ?? '',
        nombreEnfants: c.nombreEnfants ?? 0,
        referentNom: c.referentNom ?? '',
        referentTelephone: c.referentTelephone ?? '',
        referentRelation: c.referentRelation ?? '',
        agenceId: c.agenceId ? String(c.agenceId) : (c.agence?.id ? String(c.agence.id) : ''),
        commercialId: c.commercialId ? String(c.commercialId) : (c.commercial?.id ? String(c.commercial.id) : ''),
        statut: c.statut ?? 'actif',
        notes: c.notes ?? '',
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        piecesJointes: [],
      });
    }).catch(() => {
      toast.error('Client introuvable');
      router.back();
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-32 text-center text-muted-foreground text-sm">Chargement…</div>;

  if (!defaultValues) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <p className="text-muted-foreground">Client introuvable.</p>
      <button className="text-sm underline text-brand-600" onClick={() => router.back()}>Retour</button>
    </div>
  );

  if (isAgent && client && String(client.commercialId ?? client.commercial?.id) !== utilisateurId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-muted-foreground">Accès refusé — ce client ne vous appartient pas.</p>
        <button className="text-sm underline text-brand-600" onClick={() => router.back()}>Retour</button>
      </div>
    );
  }

  const handleSubmit = async (data: ClientFormData) => {
    if (!data.nom.trim() || !data.telephone.trim()) { toast.error('Nom et téléphone requis'); return; }
    setIsSubmitting(true);
    try {
      await clientService.update(id, {
        ...data,
        commercialId: data.commercialId ? Number(data.commercialId) : null,
        agenceId: data.agenceId ? Number(data.agenceId) : null,
        piecesJointes: undefined,
      });
      toast.success('Client mis à jour');
      router.push(`/dashboard/marketing/clients/${id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la mise à jour');
      setIsSubmitting(false);
    }
  };

  return (
    <ClientForm
      title={`Modifier — ${defaultValues.prenom} ${defaultValues.nom}`}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      lockedCommercialId={isAgent && utilisateurId ? utilisateurId : undefined}
    />
  );
}
