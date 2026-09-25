'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { creditService } from '@/services/creditService';
import { kycService, type DossierKycListe } from '@/services/kycService';
import { useCan } from '@/hooks/useCan';
import { formatCurrency, formatDate } from '@/lib/utils';
import { RISQUE, STATUT_KYC } from '@/lib/kycLabels';
import { STATUT_LABELS, STATUT_VARIANT, type DemandeCreditListe } from '@/types/credit';

/**
 * Vue 360° du client : ses dossiers KYC et ses demandes de crédit.
 * Chaque bloc n'apparaît que si l'utilisateur a le droit de le consulter ; un
 * refus de l'API (droit ou périmètre) masque simplement le bloc.
 */
export default function ClientCreditsKyc({ clientId }: { clientId: number }) {
  const { can } = useCan();
  const [credits, setCredits] = useState<DemandeCreditListe[] | null>(null);
  const [kyc, setKyc] = useState<DossierKycListe[] | null>(null);
  const voirCredits = can('credit:VIEW');
  const voirKyc = can('kyc:VIEW');

  useEffect(() => {
    if (voirCredits) creditService.lister({ client_id: clientId, per_page: 100 }).then((r) => setCredits(r.data)).catch(() => setCredits(null));
  }, [clientId, voirCredits]);
  useEffect(() => {
    if (voirKyc) kycService.lister({ client_id: clientId, per_page: 20 }).then((r) => setKyc(r.data)).catch(() => setKyc(null));
  }, [clientId, voirKyc]);

  if (!credits && !kyc) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {kyc && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dossiers KYC ({kyc.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {kyc.length === 0 && <p className="text-muted-foreground">Aucun dossier KYC.</p>}
            {kyc.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-md border p-2">
                <Link href={`/dashboard/kyc/${k.id}`} className="font-medium text-brand-700 hover:underline">{k.reference}</Link>
                <span className="flex items-center gap-2">
                  {k.niveauRisque && <Badge variant={RISQUE[k.niveauRisque].v}>{RISQUE[k.niveauRisque].l}</Badge>}
                  <Badge variant={STATUT_KYC[k.statut].v}>{STATUT_KYC[k.statut].l}</Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {credits && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Crédits ({credits.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {credits.length === 0 && <p className="text-muted-foreground">Aucune demande de crédit.</p>}
            {credits.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <Link href={`/dashboard/credits/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.reference}</Link>
                  <p className="text-xs text-muted-foreground">{c.produit.nom} · {formatCurrency(Number(c.montantAccorde ?? c.montantDemande))} · {formatDate(c.createdAt)}</p>
                </div>
                <Badge variant={STATUT_VARIANT[c.statut]}>{STATUT_LABELS[c.statut]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
