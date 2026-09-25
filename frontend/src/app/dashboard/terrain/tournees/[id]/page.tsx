'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Kpi } from '@/components/ui/kpi';
import AuthImage from '@/components/ui/auth-image';
import Carte, { type CarteLigne, type CartePoint } from '@/components/map/Carte';
import { tourneesApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDateTime } from '@/lib/utils';

const STATUT_VISITE: Record<string, { l: string; v: 'outline' | 'info' | 'success' | 'destructive' | 'secondary'; c: string }> = {
  prevue: { l: 'Prévue', v: 'outline', c: '#64748b' }, en_cours: { l: 'Sur place', v: 'info', c: '#3b82f6' }, realisee: { l: 'Réalisée', v: 'success', c: '#10b981' },
  manquee: { l: 'Manquée', v: 'destructive', c: '#ef4444' }, annulee: { l: 'Annulée', v: 'secondary', c: '#94a3b8' },
};

export default function TourneeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useCan();
  const [t, setT] = useState<any>(null);
  const [cmp, setCmp] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try {
      const tournee = await tourneesApi.obtenir(id);
      setT(tournee);
      setCmp(await tourneesApi.comparaison(id).catch(() => null));
      setErreur(null);
    } catch (e) { setErreur(msg(e, 'Tournée introuvable')); }
  }, [id]);
  useEffect(() => { void charger(); }, [charger]);

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupe(true);
    try { await fn(); toast.success(ok); await charger(); } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); }
  };

  if (erreur) return <div className="space-y-3"><Link href="/dashboard/terrain/tournees" className="text-sm text-muted-foreground inline-flex items-center"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Link><p className="text-destructive">{erreur}</p></div>;
  if (!t) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;

  const points: CartePoint[] = t.visites.filter((v: any) => v.latitude != null).map((v: any) => ({
    lat: Number(v.latitude), lng: Number(v.longitude), couleur: STATUT_VISITE[v.statut].c, rayon: 8, titre: `${v.ordre}. ${v.libelle}`, detail: `${STATUT_VISITE[v.statut].l} · priorité ${v.priorite}`,
  }));
  if (t.departLatitude != null) points.unshift({ lat: Number(t.departLatitude), lng: Number(t.departLongitude), couleur: '#111827', rayon: 5, titre: 'Départ' });
  const lignes: CarteLigne[] = [];
  if (cmp?.prevu?.points?.length) lignes.push({ points: [...(cmp.prevu.depart ? [[cmp.prevu.depart.lat, cmp.prevu.depart.lng]] : []), ...cmp.prevu.points.map((p: any) => [p.lat, p.lng])] as [number, number][], couleur: '#6366f1', pointille: true, titre: 'Circuit prévu' });
  if (cmp?.realise?.points?.length > 1) lignes.push({ points: cmp.realise.points.map((p: any) => [p.lat, p.lng]), couleur: '#f59e0b', titre: 'Trajet réalisé' });

  const conflits = t.visites.filter((v: any) => v.conflitDetecte);
  const superviseur = can('tournees:APPROVE');

  return (
    <div className="space-y-4">
      <Link href="/dashboard/terrain/tournees" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" />Tournées</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t.reference}</h1><Badge variant="outline">{t.type}</Badge><Badge variant={t.statut === 'terminee' ? 'success' : t.statut === 'en_cours' ? 'info' : 'outline'}>{t.statut.replace('_', ' ')}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t.agent.utilisateur.prenom} {t.agent.utilisateur.nom} · {t.zone ? `zone ${t.zone.nom} · ` : ''}{t.optimisee ? 'circuit optimisé' : 'ordre manuel'}</p>

      {cmp && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Distance prévue" valeur={`${cmp.prevu.distance_km} km`} precision={`~${cmp.prevu.duree_min} min, à vol d'oiseau ${cmp.prevu.distance_vol_oiseau_km} km`} />
          <Kpi label="Distance réalisée" valeur={`${cmp.realise.distance_km} km`} precision={`écart ${cmp.ecart_distance_km > 0 ? '+' : ''}${cmp.ecart_distance_km} km`} ton={Math.abs(cmp.ecart_distance_km) > 5 ? 'alerte' : undefined} />
          <Kpi label="Visites réalisées" valeur={`${cmp.visites.realisees} / ${cmp.visites.prevues}`} precision={`taux ${cmp.visites.taux_realisation} %`} ton={cmp.visites.taux_realisation >= 80 ? 'bon' : 'alerte'} />
          <Kpi label="Présences validées" valeur={cmp.visites.presence_validee} precision="position confirmée sur place" />
          <Kpi label="Ordre respecté" valeur={cmp.inversions_ordre === 0 ? 'Oui' : `${cmp.inversions_ordre} inversion(s)`} ton={cmp.inversions_ordre === 0 ? 'bon' : 'alerte'} />
        </div>
      )}

      {conflits.length > 0 && (
        <Card className="border-warning/50"><CardContent className="p-4 space-y-2">
          <p className="flex items-center gap-2 font-medium text-warning-700"><AlertTriangle className="h-4 w-4" />{conflits.length} conflit(s) de synchronisation à arbitrer</p>
          {conflits.map((v: any) => (
            <div key={v.id} className="rounded-md border p-2 text-sm">
              <p className="font-medium">{v.libelle}</p>
              <p className="text-xs text-muted-foreground">Serveur : {v.conflitDetail?.serveur?.statut} · Agent : {v.conflitDetail?.appareil?.resultat ?? 'arrivée'} {v.conflitDetail?.appareil?.compte_rendu ? `« ${v.conflitDetail.appareil.compte_rendu} »` : ''}</p>
              {superviseur && <div className="flex gap-2 mt-1"><Button size="sm" variant="outline" disabled={occupe} onClick={() => agir(() => tourneesApi.arbitrer(v.id, 'serveur'), 'État du serveur conservé')}>Garder l'état du serveur</Button><Button size="sm" variant="brand" disabled={occupe} onClick={() => agir(() => tourneesApi.arbitrer(v.id, 'appareil'), "Saisie de l'agent retenue")}>Retenir la saisie de l'agent</Button></div>}
            </div>
          ))}
        </CardContent></Card>
      )}

      <Card><CardContent className="p-2"><Carte points={points} lignes={lignes} hauteur={420} /></CardContent></Card>
      <p className="text-xs text-muted-foreground">Ligne pointillée : circuit prévu · ligne pleine : trajet GPS réalisé · pastilles : visites colorées selon leur statut.</p>

      {['planifiee', 'en_cours'].includes(t.statut) && can('tournees:CREATE', 'tournees:UPDATE') && (
        <div className="flex gap-2">
          {t.statut === 'planifiee' && <Button variant="outline" size="sm" disabled={occupe} onClick={() => agir(async () => { const r = await tourneesApi.optimiser(t.id); toast.info(`${r.distance_avant_km} km -> ${r.distance_apres_km} km`); }, 'Circuit réoptimisé')}>Réoptimiser</Button>}
          <Button variant="destructive" size="sm" disabled={occupe} onClick={() => { const m = window.prompt("Motif de l'annulation ?"); if (m && m.trim().length >= 3) void agir(() => tourneesApi.annuler(t.id, m.trim()), 'Tournée annulée'); }}>Annuler la tournée</Button>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Visites ({t.visites.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {t.visites.map((v: any) => (
            <div key={v.id} className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{v.ordre}. {v.libelle}</p>
                <Badge variant={STATUT_VISITE[v.statut].v}>{STATUT_VISITE[v.statut].l}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{v.adresse ?? 'Adresse non renseignée'} · priorité {v.priorite}{v.motifPriorite ? ` (${v.motifPriorite})` : ''}{v.latitude == null ? ' · sans position GPS' : ''}</p>
              {v.arriveeAt && <p className="text-xs flex items-center gap-1">{v.presenceValidee ? <CheckCircle2 className="h-3.5 w-3.5 text-success-700" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning-700" />}Arrivée {formatDateTime(v.arriveeAt)} · {v.distanceCibleM != null ? `${v.distanceCibleM} m de la cible` : 'cible non localisée'}{v.presenceValidee ? '' : ' · présence non confirmée'}</p>}
              {v.compteRendu && <p>{v.compteRendu}</p>}
              {v.signatureHash && <p className="text-xs text-muted-foreground">Signé par {v.signatureNom} · empreinte {v.signatureHash.slice(0, 12)}…</p>}
              {v.photos?.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{v.photos.map((p: any) => <AuthImage key={p.id} url={p.url} alt="Photo de visite" className="h-16 w-16 rounded object-cover border" />)}</div>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
