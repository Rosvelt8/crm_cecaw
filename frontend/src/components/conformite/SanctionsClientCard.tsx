'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { screeningApi, type Controle } from '@/services/screeningService';
import { DECISION_LABEL, DECLENCHEUR_LABEL, REVUE_LABEL, STATUT_CONTROLE } from '@/lib/sanctionsLabels';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDate, formatDateTime } from '@/lib/utils';

/**
 * Contrôle de sanctions d'un client ou prospect, sur sa fiche : plus besoin d'ouvrir les sites de l'OFAC, de l'ONU ou de l'UE.
 * Chacun voit le statut ; seuls les utilisateurs de la conformité voient les personnes listées et les scores.
 */
export default function SanctionsClientCard({ cible }: { cible: { client_id?: number; prospect_id?: number } }) {
  const { can } = useCan();
  const peutLancer = can('conformite:EXECUTE', 'crm:UPDATE', 'crm:CREATE', 'kyc:CREATE', 'kyc:EXECUTE');
  const voitConformite = can('conformite:VIEW');
  const [items, setItems] = useState<Controle[] | null>(null);
  const [occupe, setOccupe] = useState(false);
  const type = cible.client_id ? 'client' : 'prospect';
  const id = (cible.client_id ?? cible.prospect_id)!;

  const charger = useCallback(() => screeningApi.historique(type, id).then(setItems).catch(() => setItems([])), [type, id]);
  useEffect(() => { void charger(); }, [charger]);

  const lancer = async () => {
    setOccupe(true);
    try {
      const c = await screeningApi.lancer(cible);
      if (c.statut === 'erreur_technique') toast.error(c.message);
      else if (c.statut === 'correspondance_potentielle') toast.warning('Correspondance potentielle : transmise à la conformité pour examen.');
      else toast.success('Aucune correspondance avec les listes de sanctions.');
      await charger();
    } catch (e) { toast.error(msg(e, 'Contrôle impossible')); } finally { setOccupe(false); }
  };

  if (items === null && !peutLancer) return null;
  const dernier = items?.[0];
  const st = dernier ? STATUT_CONTROLE[dernier.statut] : null;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contrôle des sanctions</CardTitle>
        {peutLancer && <Button size="sm" variant="outline" onClick={lancer} disabled={occupe}>{occupe ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5 mr-1" />}{dernier ? 'Recontrôler' : 'Lancer le contrôle'}</Button>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {items === null ? <Loader2 className="h-4 w-4 animate-spin" /> : !dernier ? (
          <p className="text-muted-foreground">Aucun contrôle effectué. Le contrôle compare le nom, la date de naissance, le pays et les pièces d&apos;identité aux listes de sanctions (OFAC, ONU, UE) et aux listes de surveillance, mises à jour toutes les 6 heures.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={st!.variant}>{st!.label}</Badge>
              {dernier.revue_statut !== 'non_requise' && <Badge variant="secondary">{REVUE_LABEL[dernier.revue_statut]}</Badge>}
              <span className="text-xs text-muted-foreground">{dernier.reference} · {formatDateTime(dernier.created_at)}</span>
            </div>
            <p className="text-xs">{dernier.message}</p>
            {dernier.avertissements.map((a) => <p key={a} className="text-xs text-warning-700">⚠ {a}</p>)}
            {voitConformite && dernier.statut === 'correspondance_potentielle' && (
              <p className="text-xs">{dernier.nb_correspondances} correspondance(s), score maximal {dernier.score_max} % · <Link className="text-brand-700 hover:underline" href={`/dashboard/conformite?screening=${dernier.id}`}>Examiner</Link></p>
            )}
            {dernier.revue && <p className="text-xs text-muted-foreground">{DECISION_LABEL[dernier.revue.decision]} le {formatDate(dernier.revue.revue_at)} : {voitConformite ? dernier.revue.commentaire : 'décision de la conformité.'}</p>}

            {items.length > 1 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Historique des contrôles ({items.length})</summary>
                <ul className="mt-2 divide-y rounded-md border">
                  {items.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
                      <span>{formatDate(c.created_at)} · {DECLENCHEUR_LABEL[c.declencheur]}</span>
                      <span className="flex items-center gap-1.5">{c.revue_statut !== 'non_requise' && <span className="text-muted-foreground">{REVUE_LABEL[c.revue_statut]}</span>}<Badge variant={STATUT_CONTROLE[c.statut].variant} className="text-[10px]">{STATUT_CONTROLE[c.statut].label}</Badge></span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
