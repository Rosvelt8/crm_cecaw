'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi, fcfa } from '@/components/ui/kpi';
import Carte, { type CartePolygone, type CartePoint } from '@/components/map/Carte';
import { sigApi } from '@/services/metierService';
import { agenceService } from '@/services/agenceService';
import { useCan } from '@/hooks/useCan';
import { msg, telecharger } from '@/lib/apiHelpers';

const STATUT: Record<string, { l: string; v: 'success' | 'warning' | 'destructive' | 'info' }> = {
  couverte: { l: 'Couverte', v: 'success' }, sous_couverte: { l: 'Sous-couverte', v: 'warning' }, non_couverte: { l: 'Non couverte', v: 'destructive' }, fort_potentiel: { l: 'Fort potentiel', v: 'info' },
};

export default function TerritoirePage() {
  const { can } = useCan();
  const [agences, setAgences] = useState<any[]>([]);
  const [agenceId, setAgenceId] = useState('');
  const [zones, setZones] = useState<any[]>([]);
  const [couverture, setCouverture] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dec, setDec] = useState({ nb: 4, cible: 'tous', prefixe: 'Zone' });
  const [apercu, setApercu] = useState<any>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => { agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {}); }, []);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const id = agenceId ? Number(agenceId) : undefined;
      const [z, c] = await Promise.all([sigApi.analyse(id), sigApi.couverture(id)]);
      setZones(z); setCouverture(c); setErreur(null);
    } catch (e) { setErreur(msg(e, 'Chargement impossible')); }
    finally { setChargement(false); }
  }, [agenceId]);
  useEffect(() => { void charger(); }, [charger]);

  const decouper = async (confirmer: boolean) => {
    if (!agenceId) { toast.error("Choisissez d'abord une agence."); return; }
    setOccupe(true);
    try {
      const r = await sigApi.decoupage({ agence_id: Number(agenceId), nb_zones: dec.nb, cible: dec.cible, prefixe: dec.prefixe, confirmer });
      if (confirmer) { toast.success(`${r.zones.length} zone(s) créée(s)`); setApercu(null); await charger(); } else setApercu(r.apercu);
    } catch (e) { toast.error(msg(e, 'Découpage impossible')); } finally { setOccupe(false); }
  };

  const polys: CartePolygone[] = (apercu ?? []).filter((z: any) => z.geometrie).map((z: any) => ({ anneau: z.geometrie.coordinates[0].map(([lng, lat]: number[]) => [lat, lng]), couleur: '#6366f1', titre: `${z.nom} : ${z.nb_points} point(s)` }));
  const centres: CartePoint[] = (apercu ?? []).map((z: any) => ({ lat: z.centre.lat, lng: z.centre.lng, couleur: '#6366f1', rayon: 7, titre: z.nom }));
  const nb = (s: string) => zones.filter((z) => z.statut === s).length;

  return (
    <div className="space-y-4">
      <EnTete titre="Territoire" sousTitre="Couverture, pénétration, densité, potentiel et distribution par zone">
        <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={agenceId} onChange={(e) => { setAgenceId(e.target.value); setApercu(null); }}><option value="">Toutes les agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
        {can('territoire:EXPORT') && <Button variant="outline" onClick={() => telecharger(`/sig/territoire/analyse?format=csv${agenceId ? `&agence_id=${agenceId}` : ''}`, 'analyse-territoire.csv').catch((e) => toast.error(msg(e)))}><Download className="h-4 w-4 mr-1.5" />CSV</Button>}
      </EnTete>

      {chargement ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : erreur ? <p className="text-destructive">{erreur}</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Zones" valeur={zones.length} />
            <Kpi label="Non couvertes" valeur={nb('non_couverte')} precision="sans agent ou sans agence" ton={nb('non_couverte') ? 'mauvais' : 'bon'} />
            <Kpi label="Sous-couvertes" valeur={nb('sous_couverte')} precision="pénétration sous le seuil" ton={nb('sous_couverte') ? 'alerte' : 'bon'} />
            <Kpi label="À fort potentiel" valeur={nb('fort_potentiel')} precision="quart supérieur du potentiel restant" />
          </div>

          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Zone</th><th className="px-3 py-2 text-right">Clients</th><th className="px-3 py-2 text-right">Prospects</th><th className="px-3 py-2 text-right">Pénétration</th><th className="px-3 py-2 text-right">Densité /km²</th>
              <th className="px-3 py-2 text-right">Potentiel restant</th><th className="px-3 py-2 text-right">Comptes</th><th className="px-3 py-2 text-right">Épargne</th><th className="px-3 py-2 text-right">Encours crédit</th><th className="px-3 py-2 text-right">Agents</th><th className="px-3 py-2 text-left">Statut</th></tr></thead>
              <tbody>
                {zones.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">Aucune zone : créez-en dans Paramètres › Zones, ou utilisez le découpage automatique ci-dessous.</td></tr>}
                {zones.map((z) => (
                  <tr key={z.zone_id} className="border-t"><td className="px-3 py-2 font-medium">{z.nom}<span className="ml-1 text-xs text-muted-foreground">{z.agence ?? 'sans agence'}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.nb_clients}</td><td className="px-3 py-2 text-right tabular-nums">{z.nb_prospects}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.penetration_pct != null ? `${z.penetration_pct} %` : '—'}</td><td className="px-3 py-2 text-right tabular-nums">{z.densite_km2 ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.potentiel_restant || '—'}</td><td className="px-3 py-2 text-right tabular-nums">{z.nb_comptes}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fcfa(z.epargne)}</td><td className="px-3 py-2 text-right tabular-nums">{fcfa(z.encours_credit)}</td><td className="px-3 py-2 text-right tabular-nums">{z.nb_agents}</td>
                    <td className="px-3 py-2"><Badge variant={STATUT[z.statut].v}>{STATUT[z.statut].l}</Badge></td></tr>))}
              </tbody></table>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground">Pénétration = clients actifs / population de la zone. Le potentiel restant = population − clients. Renseignez la population et la surface (polygone) des zones pour affiner ces indicateurs.</p>

          <Card>
            <CardHeader><CardTitle className="text-base">Couverture des agences</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {couverture.map((c) => (
                <div key={c.agence_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="font-medium">{c.nom}</span>
                  {!c.localisee ? <Badge variant="warning">Agence non localisée</Badge> : <span>{c.clients_couverts} / {c.clients_geolocalises} clients dans {c.rayon_km} km ({c.taux_couverture_pct ?? '—'} %) · distance moyenne {c.distance_moyenne_km ?? '—'} km</span>}
                </div>
              ))}
            </CardContent>
          </Card>

          {can('territoire:EXECUTE') && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wand2 className="h-4 w-4" />Découpage automatique en zones</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Regroupe les clients et prospects géolocalisés de l'agence choisie en zones compactes (k-moyennes), avec un polygone par zone. Un aperçu est proposé avant toute création.</p>
                <div className="grid sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5"><Label>Nombre de zones</Label><Input type="number" min={2} max={30} value={dec.nb} onChange={(e) => setDec({ ...dec, nb: Number(e.target.value) })} /></div>
                  <div className="space-y-1.5"><Label>À partir de</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={dec.cible} onChange={(e) => setDec({ ...dec, cible: e.target.value })}><option value="tous">Clients et prospects</option><option value="clients">Clients</option><option value="prospects">Prospects</option></select></div>
                  <div className="space-y-1.5"><Label>Préfixe</Label><Input value={dec.prefixe} onChange={(e) => setDec({ ...dec, prefixe: e.target.value })} /></div>
                  <div className="flex items-end"><Button variant="outline" disabled={occupe || !agenceId} onClick={() => decouper(false)}>Aperçu</Button></div>
                </div>
                {!agenceId && <p className="text-xs text-warning-700">Choisissez une agence en haut de page.</p>}
                {apercu && (
                  <div className="space-y-2">
                    <Carte polygones={polys} points={centres} hauteur={360} />
                    <p className="text-sm">{apercu.map((z: any) => `${z.nom} : ${z.nb_points}`).join(' · ')}</p>
                    <Button variant="brand" disabled={occupe} onClick={() => decouper(true)}>Créer ces {apercu.length} zones</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
