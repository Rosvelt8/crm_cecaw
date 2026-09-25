'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Camera, LocateFixed, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AuthImage from '@/components/ui/auth-image';
import apiClient from '@/lib/axios';
import { donnees, msg } from '@/lib/apiHelpers';
import { useCan } from '@/hooks/useCan';
import { fcfa } from '@/components/ui/kpi';

interface Ligne { libelle: string; montant_mensuel: number; nature?: string; justifie?: boolean; categorie?: string }

/**
 * Situation financière du client (KYC 12 à 14) : sources de revenus, charges, ancienneté, localisation de
 * l'activité et photo. Ces données alimentent la grille d'analyse lors du montage d'un crédit.
 */
export default function ClientFinances({ clientId }: { clientId: number }) {
  const { can } = useCan();
  const voir = can('kyc:VIEW', 'credit:VIEW');
  const modifier = can('kyc:CREATE', 'kyc:UPDATE');
  const [d, setD] = useState<any>(null);
  const [sources, setSources] = useState<Ligne[]>([]);
  const [charges, setCharges] = useState<Ligne[]>([]);
  const [anc, setAnc] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [sale, setSale] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await apiClient.get(`/kyc/clients/${clientId}/finances`).then(donnees<any>);
      setD(r);
      setSources(r.sources.map((s: any) => ({ libelle: s.libelle, nature: s.nature ?? '', montant_mensuel: Number(s.montantMensuel), justifie: s.justifie })));
      setCharges(r.charges.map((c: any) => ({ libelle: c.libelle, categorie: c.categorie ?? '', montant_mensuel: Number(c.montantMensuel) })));
      setAnc(r.anciennete_activite_mois != null ? String(r.anciennete_activite_mois) : '');
      setLat(r.latitude_activite != null ? String(r.latitude_activite) : '');
      setLng(r.longitude_activite != null ? String(r.longitude_activite) : '');
      setSale(false);
    } catch { setD(null); }
  }, [clientId]);
  useEffect(() => { if (voir) void charger(); }, [voir, charger]);

  if (!voir || !d) return null;

  const enregistrer = async () => {
    try {
      await apiClient.put(`/kyc/clients/${clientId}/finances`, {
        anciennete_activite_mois: anc === '' ? undefined : Number(anc),
        latitude_activite: lat === '' ? null : Number(lat), longitude_activite: lng === '' ? null : Number(lng),
        sources: sources.filter((s) => s.libelle.trim()).map((s) => ({ ...s, nature: s.nature || undefined })),
        charges: charges.filter((c) => c.libelle.trim()).map((c) => ({ ...c, categorie: c.categorie || undefined })),
      });
      toast.success('Situation financière enregistrée');
      await charger();
    } catch (e) { toast.error(msg(e)); }
  };

  const position = () => {
    if (!navigator.geolocation) { toast.error('Géolocalisation indisponible'); return; }
    navigator.geolocation.getCurrentPosition((p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setSale(true); }, () => toast.error('Position refusée ou indisponible'), { enableHighAccuracy: true, timeout: 15000 });
  };

  const photo = async (f: File | undefined) => {
    if (!f) return;
    const form = new FormData();
    form.append('photo', f);
    try { await apiClient.post(`/kyc/clients/${clientId}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } }); toast.success('Photo enregistrée'); await charger(); }
    catch (e) { toast.error(msg(e)); }
  };

  const totalSources = sources.reduce((s, x) => s + (x.montant_mensuel || 0), 0);
  const totalCharges = charges.reduce((s, x) => s + (x.montant_mensuel || 0), 0);
  const edit = <T extends Ligne>(liste: T[], set: (l: T[]) => void, i: number, patch: Partial<T>) => { set(liste.map((x, j) => (j === i ? { ...x, ...patch } : x))); setSale(true); };

  const bloc = ({ titre, liste, set, total, vide }: { titre: string; liste: Ligne[]; set: (l: Ligne[]) => void; total: number; vide: Ligne }) => (
    <div key={titre} className="space-y-2">
      <div className="flex items-center justify-between"><p className="text-sm font-medium">{titre}</p><p className="text-xs text-muted-foreground">Total mensuel : {fcfa(total)}</p></div>
      {liste.length === 0 && <p className="text-xs text-muted-foreground">Aucune ligne.</p>}
      {liste.map((l, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <Input disabled={!modifier} className="col-span-7 h-9" placeholder="Libellé" value={l.libelle} onChange={(e) => edit(liste, set, i, { libelle: e.target.value })} />
          <Input disabled={!modifier} className="col-span-4 h-9" type="number" min={0} placeholder="Montant / mois" value={l.montant_mensuel || ''} onChange={(e) => edit(liste, set, i, { montant_mensuel: Number(e.target.value) })} />
          {modifier && <button className="col-span-1 text-muted-foreground hover:text-destructive" onClick={() => { set(liste.filter((_, j) => j !== i)); setSale(true); }}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {modifier && <Button size="sm" variant="ghost" onClick={() => { set([...liste, { ...vide }]); setSale(true); }}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Situation financière et activité</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 shrink-0 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
            {d.photo_url ? <AuthImage url={d.photo_url} alt="Photo du client" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6 text-muted-foreground/40" />}
          </div>
          <div className="space-y-2">
            {modifier && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"><Camera className="h-3.5 w-3.5" />{d.photo_url ? 'Remplacer la photo' : 'Ajouter une photo'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void photo(e.target.files?.[0])} /></label>}
            <p className="text-xs text-muted-foreground">Revenus retenus : <strong>{d.revenus_mensuels != null ? fcfa(d.revenus_mensuels) : 'non renseignés'}</strong>{d.charges_mensuelles != null && <> · charges : <strong>{fcfa(d.charges_mensuelles)}</strong></>}</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {bloc({ titre: 'Sources de revenus', liste: sources, set: setSources, total: totalSources, vide: { libelle: '', montant_mensuel: 0 } })}
          {bloc({ titre: 'Charges', liste: charges, set: setCharges, total: totalCharges, vide: { libelle: '', montant_mensuel: 0 } })}
        </div>
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Ancienneté de l'activité (mois)</label><Input disabled={!modifier} type="number" min={0} value={anc} onChange={(e) => { setAnc(e.target.value); setSale(true); }} /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Latitude de l'activité</label><Input disabled={!modifier} type="number" step="any" value={lat} onChange={(e) => { setLat(e.target.value); setSale(true); }} /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Longitude de l'activité</label><Input disabled={!modifier} type="number" step="any" value={lng} onChange={(e) => { setLng(e.target.value); setSale(true); }} /></div>
          {modifier && <Button variant="outline" size="sm" onClick={position}><LocateFixed className="h-4 w-4 mr-1.5" />Ma position</Button>}
        </div>
        {modifier && <Button variant="brand" size="sm" disabled={!sale} onClick={enregistrer}>Enregistrer</Button>}
      </CardContent>
    </Card>
  );
}
