'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Camera, FileText, LocateFixed, Paperclip, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AuthImage from '@/components/ui/auth-image';
import apiClient from '@/lib/axios';
import { cheminFichier, donnees, msg, telecharger } from '@/lib/apiHelpers';
import { useCan } from '@/hooks/useCan';
import { fcfa } from '@/components/ui/kpi';

interface Ligne { libelle: string; montant_mensuel: number; nature?: string; justifie?: boolean; categorie?: string }

/**
 * Situation financière du client (KYC 12 à 14) : sources de revenus, charges, ancienneté, localisation de
 * l'activité et photo. Ces données alimentent la grille d'analyse lors du montage d'un crédit.
 */
export default function ClientFinances({ clientId, demandeId, compact, mensualite }: {
  clientId: number;
  /** Vue compacte (sans photo ni localisation) : demande de crédit, y compris avant sa création. */
  compact?: boolean;
  /** Présent quand le composant est affiché dans une demande de crédit : vue compacte, preuves rattachées à la demande. */
  demandeId?: number;
  /** Mensualité estimée de la demande, pour situer la capacité de remboursement. */
  mensualite?: number | null;
}) {
  const { can } = useCan();
  const voir = can('kyc:VIEW', 'credit:VIEW');
  const modifier = can('kyc:CREATE', 'kyc:UPDATE');
  const peutJoindre = can('kyc:CREATE', 'kyc:UPDATE', 'credit:UPDATE');
  const dansCredit = compact ?? demandeId !== undefined;
  const [preuves, setPreuves] = useState<any[]>([]);
  const [intitulePreuve, setIntitulePreuve] = useState('');
  const [envoiPreuve, setEnvoiPreuve] = useState(false);
  const [d, setD] = useState<any>(null);
  const [sources, setSources] = useState<Ligne[]>([]);
  const [charges, setCharges] = useState<Ligne[]>([]);
  const [anc, setAnc] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [sale, setSale] = useState(false);
  const [photosActivite, setPhotosActivite] = useState<any[]>([]);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);

  const chargerPhotosActivite = useCallback(async () => {
    try { setPhotosActivite(await apiClient.get(`/kyc/clients/${clientId}/photos-activite`).then(donnees<any[]>)); }
    catch { setPhotosActivite([]); }
  }, [clientId]);

  const chargerPreuves = useCallback(async () => {
    try { setPreuves(await apiClient.get(`/kyc/clients/${clientId}/justificatifs-financiers`).then(donnees<any[]>)); }
    catch { setPreuves([]); }
  }, [clientId]);

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
  useEffect(() => { if (voir) { void charger(); void chargerPreuves(); if (!dansCredit) void chargerPhotosActivite(); } }, [voir, dansCredit, charger, chargerPreuves, chargerPhotosActivite]);

  const [etat, setEtat] = useState<'' | 'enregistrement' | 'ok' | 'erreur'>('');

  // Enregistrement automatique : une ligne saisie n'est plus perdue si l'on oublie le bouton « Enregistrer ».
  // Seules les lignes avec un libellé sont envoyées ; l'écran n'est pas rechargé pendant la frappe.
  useEffect(() => {
    if (!sale || !modifier || !d) return;
    const t = setTimeout(async () => {
      setEtat('enregistrement');
      try {
        await apiClient.put(`/kyc/clients/${clientId}/finances`, {
          anciennete_activite_mois: anc === '' ? undefined : Number(anc),
          latitude_activite: lat === '' ? null : Number(lat), longitude_activite: lng === '' ? null : Number(lng),
          sources: sources.filter((x) => x.libelle.trim()).map((x) => ({ ...x, nature: x.nature || undefined })),
          charges: charges.filter((x) => x.libelle.trim()).map((x) => ({ ...x, categorie: x.categorie || undefined })),
        });
        setSale(false); setEtat('ok');
      } catch (e) { setEtat('erreur'); toast.error(`Enregistrement automatique impossible : ${msg(e)}`); }
    }, 1500);
    return () => clearTimeout(t);
  }, [sale, modifier, d, clientId, anc, lat, lng, sources, charges]);

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

  /** Photo de l'activité professionnelle (compléments stratégiques, point 9) : géolocalisée si la
   * position est disponible, additive (galerie), distincte de la photo du client ci-dessus. */
  const ajouterPhotoActivite = async (f: File | undefined) => {
    if (!f) return;
    setEnvoiPhoto(true);
    const form = new FormData();
    form.append('photo', f);
    const joindrePosition = (p: GeolocationPosition | null) => {
      if (p) { form.append('latitude', String(p.coords.latitude)); form.append('longitude', String(p.coords.longitude)); }
    };
    await new Promise<void>((resolve) => {
      if (!navigator.geolocation) { resolve(); return; }
      navigator.geolocation.getCurrentPosition((p) => { joindrePosition(p); resolve(); }, () => resolve(), { enableHighAccuracy: true, timeout: 8000 });
    });
    try {
      await apiClient.post(`/kyc/clients/${clientId}/photos-activite`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success("Photo de l'activité ajoutée");
      await chargerPhotosActivite();
    } catch (e) { toast.error(msg(e)); } finally { setEnvoiPhoto(false); }
  };

  const joindrePreuve = async (f: File | undefined) => {
    if (!f) return;
    setEnvoiPreuve(true);
    const form = new FormData();
    form.append('fichier', f);
    if (intitulePreuve.trim()) form.append('intitule', intitulePreuve.trim());
    if (demandeId) form.append('demande_id', String(demandeId));
    try {
      await apiClient.post(`/kyc/clients/${clientId}/justificatifs-financiers`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Justificatif ajouté'); setIntitulePreuve(''); await chargerPreuves();
    } catch (e) { toast.error(msg(e)); } finally { setEnvoiPreuve(false); }
  };
  const retirerPreuve = async (pid: number) => {
    try { await apiClient.delete(`/kyc/clients/${clientId}/justificatifs-financiers/${pid}`); await chargerPreuves(); }
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
        <div key={i} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2.5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><Input disabled={!modifier} className="h-10" aria-label="Libellé" placeholder="Libellé (ex. Commerce, loyer…)" value={l.libelle} onChange={(e) => edit(liste, set, i, { libelle: e.target.value })} /></div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <div className="w-40 shrink-0"><Input disabled={!modifier} className="h-10 text-right" type="number" min={0} aria-label="Montant mensuel" placeholder="Montant" value={l.montant_mensuel || ''} onChange={(e) => edit(liste, set, i, { montant_mensuel: Number(e.target.value) })} /></div>
            <span className="shrink-0 text-xs text-muted-foreground">FCFA / mois</span>
            {titre === 'Sources de revenus' && (
              <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-muted-foreground" title="Cochez quand une preuve confirme ce revenu">
                <input type="checkbox" disabled={!modifier} checked={!!l.justifie} onChange={(e) => edit(liste, set, i, { justifie: e.target.checked })} />Justifié
              </label>
            )}
            {modifier && <button type="button" aria-label="Supprimer la ligne" className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => { set(liste.filter((_, j) => j !== i)); setSale(true); }}><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
      ))}
      {modifier && <Button size="sm" variant="ghost" onClick={() => { set([...liste, { ...vide }]); setSale(true); }}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Situation financière et activité</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!dansCredit && <div className="flex items-start gap-4">
          <div className="h-24 w-24 shrink-0 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
            {d.photo_url ? <AuthImage url={d.photo_url} alt="Photo du client" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6 text-muted-foreground/40" />}
          </div>
          <div className="space-y-2">
            {modifier && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"><Camera className="h-3.5 w-3.5" />{d.photo_url ? 'Remplacer la photo' : 'Ajouter une photo'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void photo(e.target.files?.[0])} /></label>}
            <p className="text-xs text-muted-foreground">Revenus retenus : <strong>{d.revenus_mensuels != null ? fcfa(d.revenus_mensuels) : 'non renseignés'}</strong>{d.charges_mensuelles != null && <> · charges : <strong>{fcfa(d.charges_mensuelles)}</strong></>}</p>
          </div>
        </div>}
        {dansCredit && (() => {
          const revenus = totalSources, dispo = revenus - totalCharges;
          const justifies = sources.filter((x) => x.justifie).reduce((a, x) => a + (x.montant_mensuel || 0), 0);
          const part = revenus > 0 ? Math.round((justifies / revenus) * 100) : 0;
          return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Revenus mensuels déclarés</p><p className="text-lg font-semibold tabular-nums">{fcfa(revenus)}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Charges mensuelles</p><p className="text-lg font-semibold tabular-nums">{fcfa(totalCharges)}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Disponible après charges</p><p className={`text-lg font-semibold tabular-nums ${dispo < 0 ? 'text-destructive' : ''}`}>{fcfa(dispo)}</p>
                {mensualite ? <p className="text-xs text-muted-foreground">Mensualité estimée : {fcfa(mensualite)} ({dispo > 0 ? Math.round((mensualite / dispo) * 100) : '>100'} % du disponible)</p> : null}</div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Revenus justifiés</p><p className="text-lg font-semibold tabular-nums">{part} %</p><p className="text-xs text-muted-foreground">{preuves.length} justificatif(s) joint(s)</p></div>
            </div>
          );
        })()}
        <div className="grid gap-6 2xl:grid-cols-2">
          {bloc({ titre: 'Sources de revenus', liste: sources, set: setSources, total: totalSources, vide: { libelle: '', montant_mensuel: 0 } })}
          {bloc({ titre: 'Charges', liste: charges, set: setCharges, total: totalCharges, vide: { libelle: '', montant_mensuel: 0 } })}
        </div>
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Ancienneté de l'activité (mois)</label><Input disabled={!modifier} type="number" min={0} value={anc} onChange={(e) => { setAnc(e.target.value); setSale(true); }} /></div>
          {!dansCredit && <><div className="space-y-1"><label className="text-xs text-muted-foreground">Latitude de l'activité</label><Input disabled={!modifier} type="number" step="any" value={lat} onChange={(e) => { setLat(e.target.value); setSale(true); }} /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Longitude de l'activité</label><Input disabled={!modifier} type="number" step="any" value={lng} onChange={(e) => { setLng(e.target.value); setSale(true); }} /></div>
          {modifier && <Button variant="outline" size="sm" onClick={position}><LocateFixed className="h-4 w-4 mr-1.5" />Ma position</Button>}</>}
        </div>
        {modifier && (
          <div className="flex items-center gap-3">
            <Button variant="brand" size="sm" disabled={!sale && etat !== 'erreur'} onClick={enregistrer}>Enregistrer</Button>
            <span className={`text-xs ${etat === 'erreur' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {sale && etat !== 'enregistrement' ? 'Modifications en attente d\'enregistrement…' : etat === 'enregistrement' ? 'Enregistrement…' : etat === 'ok' ? '✓ Enregistré' : etat === 'erreur' ? 'Échec de l\'enregistrement' : ''}
            </span>
          </div>
        )}

        <div className="pt-2 border-t space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Justificatifs financiers ({preuves.length})</p>
            {peutJoindre && (
              <div className="flex flex-wrap items-center gap-2">
                <Input className="h-9 min-w-64" placeholder="Nature (ex. relevé Mobile Money, facture loyer)" value={intitulePreuve} onChange={(e) => setIntitulePreuve(e.target.value)} />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">
                  <Paperclip className="h-3.5 w-3.5" />{envoiPreuve ? 'Envoi…' : 'Joindre un fichier'}
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" disabled={envoiPreuve} onChange={(e) => { void joindrePreuve(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
            )}
          </div>
          {preuves.length === 0 ? <p className="text-xs text-muted-foreground">Aucun justificatif. Joignez relevés, factures, bulletins ou registre de commerce pour appuyer les montants déclarés.</p> : (
            <ul className="divide-y rounded-lg border">
              {preuves.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button type="button" className="flex min-w-0 items-center gap-2 text-left hover:underline" onClick={() => telecharger(cheminFichier(p.url), p.nomFichier, true).catch((e) => toast.error(msg(e, 'Fichier indisponible')))}>
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{p.intitule}</span>
                  </button>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString('fr-FR')}{p.demandeCreditId ? ' · dossier de crédit' : ''}
                    {peutJoindre && <button type="button" aria-label="Retirer" className="rounded p-1 hover:bg-destructive/10 hover:text-destructive" onClick={() => void retirerPreuve(p.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!dansCredit && <div className="pt-2 border-t space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photos de l'activité ({photosActivite.length})</p>
            {modifier && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">
              <Camera className="h-3.5 w-3.5" />{envoiPhoto ? 'Envoi…' : 'Ajouter une photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={envoiPhoto} onChange={(e) => void ajouterPhotoActivite(e.target.files?.[0])} />
            </label>}
          </div>
          {photosActivite.length === 0 ? <p className="text-xs text-muted-foreground">Aucune photo de l'activité.</p> : (
            <div className="flex flex-wrap gap-2">
              {photosActivite.map((p) => (
                <div key={p.id} className="h-20 w-20 rounded-lg border overflow-hidden" title={p.prisAt ? new Date(p.prisAt).toLocaleString('fr-FR') : ''}>
                  <AuthImage url={p.url} alt="Photo de l'activité" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>}
      </CardContent>
    </Card>
  );
}
