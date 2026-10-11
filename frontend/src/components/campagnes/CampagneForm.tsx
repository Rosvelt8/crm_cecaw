'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { campagnesApi, calendrierApi } from '@/services/metierService';
import { adminService, type MarcheRef, type SecteurRef } from '@/services/adminService';
import { agenceService } from '@/services/agenceService';
import { msg } from '@/lib/apiHelpers';
import { CYCLE_LABEL } from '@/lib/segmentationLabels';
import { CANAL_CAMPAGNE, TYPE_CAMPAGNE } from '@/lib/campagneLabels';
import { PersonnelPicker } from './PersonnelPicker';

const champ = 'h-10 w-full rounded-lg border bg-background px-3 text-sm';
const jourIso = (d?: string | null) => (d ? String(d).slice(0, 10) : '');

interface Props {
  /** Campagne existante (mode modification) ; absente en création. */
  initiale?: any;
}

/** Formulaire de campagne : informations générales, budget, pilotage, message et ciblage. */
export function CampagneForm({ initiale }: Props) {
  const router = useRouter();
  const crit = (initiale?.criteres ?? {}) as Record<string, any>;
  const [f, setF] = useState({
    nom: initiale?.nom ?? '',
    type: initiale?.type ?? 'acquisition',
    description: initiale?.description ?? '',
    objectif_general: initiale?.objectifGeneral ?? '',
    date_debut: jourIso(initiale?.dateDebut) || new Date().toISOString().slice(0, 10),
    date_fin: jourIso(initiale?.dateFin),
    budget: initiale?.budget != null ? String(Number(initiale.budget)) : '',
    cout_reel: initiale?.coutReel != null ? String(Number(initiale.coutReel)) : '',
    agence_id: initiale?.agenceId ? String(initiale.agenceId) : '',
    evenement_calendrier_id: initiale?.evenementCalendrierId ? String(initiale.evenementCalendrierId) : '',
    canal: initiale?.canal ?? '',
    message: initiale?.message ?? '',
    cycle_vie: (crit.cycle_vie ?? []) as string[],
    marche_id: crit.marche_id ? String(crit.marche_id) : '',
    secteur_id: crit.secteur_id ? String(crit.secteur_id) : '',
    cible_agence_id: crit.agence_id ? String(crit.agence_id) : '',
    potentiel_min: crit.potentiel_min != null ? String(crit.potentiel_min) : '',
  });
  const [responsable, setResponsable] = useState<{ id: number; prenom: string; nom: string } | null>(initiale?.responsable ?? null);
  const [marches, setMarches] = useState<MarcheRef[]>([]);
  const [secteurs, setSecteurs] = useState<SecteurRef[]>([]);
  const [agences, setAgences] = useState<{ id: number; nom: string }[]>([]);
  const [evenements, setEvenements] = useState<any[]>([]);
  const [estimation, setEstimation] = useState<number | null>(null);
  const [occupe, setOccupe] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const lancee = initiale && initiale.statut !== 'brouillon';

  useEffect(() => {
    adminService.marches().then(setMarches).catch(() => {});
    adminService.secteurs().then(setSecteurs).catch(() => {});
    agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {});
    const an = new Date().getFullYear();
    Promise.all([calendrierApi.lister({ annee: an }), calendrierApi.lister({ annee: an + 1 })]).then(([a, b]) => setEvenements([...a, ...b])).catch(() => {});
  }, []);

  const criteres = () => {
    const c: Record<string, unknown> = {};
    if (f.cycle_vie.length) c.cycle_vie = f.cycle_vie;
    if (f.marche_id) c.marche_id = Number(f.marche_id);
    if (f.secteur_id) c.secteur_id = Number(f.secteur_id);
    if (f.cible_agence_id) c.agence_id = Number(f.cible_agence_id);
    if (f.potentiel_min !== '') c.potentiel_min = Number(f.potentiel_min);
    return c;
  };

  // Estimation du nombre de clients visés, rafraîchie quand les critères changent.
  const cleCriteres = JSON.stringify(criteres());
  useEffect(() => {
    const t = setTimeout(() => { campagnesApi.apercuCibles(JSON.parse(cleCriteres)).then((r) => setEstimation(r.nb_cibles_estime)).catch(() => setEstimation(null)); }, 350);
    return () => clearTimeout(t);
  }, [cleCriteres]);

  const enregistrer = async () => {
    setOccupe(true);
    const corps = {
      nom: f.nom.trim(), type: f.type, description: f.description || null, objectif_general: f.objectif_general || null,
      date_debut: f.date_debut, date_fin: f.date_fin || null,
      budget: f.budget === '' ? null : Number(f.budget), cout_reel: f.cout_reel === '' ? null : Number(f.cout_reel),
      responsable_id: responsable?.id ?? null, agence_id: f.agence_id ? Number(f.agence_id) : null,
      evenement_calendrier_id: f.evenement_calendrier_id ? Number(f.evenement_calendrier_id) : null,
      canal: f.canal || null, message: f.message || null, criteres: criteres(),
    };
    try {
      if (initiale) { await campagnesApi.modifier(initiale.id, corps); toast.success('Campagne mise à jour'); router.push(`/dashboard/marketing/campagnes/${initiale.id}`); }
      else { const c = await campagnesApi.creer(corps); toast.success('Campagne créée en brouillon'); router.push(`/dashboard/marketing/campagnes/${c.id}`); }
    } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); }
  };

  const pret = f.nom.trim() && f.date_debut && (!f.canal || f.message.trim()) && (!f.date_fin || f.date_fin >= f.date_debut);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Informations générales</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-2"><Label>Nom de la campagne *</Label><Input value={f.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="Ex. Rentrée scolaire 2026 — crédit scolarité" /></div>
          <div className="space-y-1.5"><Label>Type</Label><select className={champ} value={f.type} onChange={(e) => set({ type: e.target.value })}>{Object.entries(TYPE_CAMPAGNE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="space-y-1.5"><Label>Agence porteuse</Label><select className={champ} value={f.agence_id} onChange={(e) => set({ agence_id: e.target.value })}><option value="">Tout le réseau</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></div>
          <div className="space-y-1.5"><Label>Début *</Label><Input type="date" value={f.date_debut} onChange={(e) => set({ date_debut: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Fin</Label><Input type="date" value={f.date_fin} min={f.date_debut} onChange={(e) => set({ date_fin: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Événement du calendrier associé</Label><select className={champ} value={f.evenement_calendrier_id} onChange={(e) => set({ evenement_calendrier_id: e.target.value })}><option value="">Aucun</option>{evenements.map((e) => <option key={e.id} value={e.id}>{e.nom} ({jourIso(e.dateDebut)})</option>)}</select></div>
          <div className="space-y-1.5 sm:col-span-4"><Label>Description</Label><Textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Contexte, offre mise en avant, mécanique de la campagne…" /></div>
          <div className="space-y-1.5 sm:col-span-4"><Label>Objectif général</Label><Textarea rows={2} value={f.objectif_general} onChange={(e) => set({ objectif_general: e.target.value })} placeholder="Finalité en clair. Les cibles chiffrées se rattachent ensuite dans l'onglet Objectifs." /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pilotage et budget</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Responsable</Label>
            {responsable ? (
              <div className="flex items-center justify-between rounded-lg border px-3 h-10 text-sm">
                <span>{responsable.prenom} {responsable.nom}</span>
                <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setResponsable(null)}>Retirer</button>
              </div>
            ) : <PersonnelPicker onChoisir={(u) => setResponsable(u)} placeholder="Rechercher un collaborateur…" />}
          </div>
          <div className="space-y-1.5"><Label>Budget (FCFA)</Label><Input type="number" min={0} value={f.budget} onChange={(e) => set({ budget: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Coût réel (FCFA)</Label><Input type="number" min={0} value={f.cout_reel} onChange={(e) => set({ cout_reel: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Message et ciblage automatique</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Canal d&apos;envoi</Label>
              <select className={champ} value={f.canal} onChange={(e) => set({ canal: e.target.value })} disabled={!!lancee}>
                <option value="">Aucun (terrain, événement…)</option>
                {Object.entries(CANAL_CAMPAGNE).map(([k, l]) => <option key={k} value={k}>{l}{k === 'email' ? ' (pas encore actif)' : ''}</option>)}
              </select>
            </div>
            {f.canal && <div className="space-y-1.5 sm:col-span-3"><Label>Message * <span className="text-muted-foreground font-normal">({'{{prenom}}'}, {'{{nom}}'})</span></Label><Textarea rows={2} maxLength={600} value={f.message} onChange={(e) => set({ message: e.target.value })} /></div>}
          </div>
          {lancee && <p className="text-xs text-muted-foreground">La campagne est lancée : changer les critères n&apos;ajoutera de nouvelles cibles qu&apos;au prochain lancement ; les messages déjà envoyés ne sont pas modifiés.</p>}
          <p className="text-xs text-muted-foreground">Clients ciblés automatiquement au lancement (laisser vide = tous les clients actifs). Clients et prospects peuvent aussi être liés nominativement depuis la fiche de la campagne.</p>
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="sm:col-span-4 flex flex-wrap gap-3 text-sm">
              {Object.entries(CYCLE_LABEL).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={f.cycle_vie.includes(k)} onChange={() => set({ cycle_vie: f.cycle_vie.includes(k) ? f.cycle_vie.filter((x) => x !== k) : [...f.cycle_vie, k] })} />{l}</label>
              ))}
            </div>
            <select className={champ} value={f.marche_id} onChange={(e) => set({ marche_id: e.target.value })}><option value="">Tous les marchés</option>{marches.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select>
            <select className={champ} value={f.secteur_id} onChange={(e) => set({ secteur_id: e.target.value })}><option value="">Tous les secteurs</option>{secteurs.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select>
            <select className={champ} value={f.cible_agence_id} onChange={(e) => set({ cible_agence_id: e.target.value })}><option value="">Clients de toutes les agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
            <Input type="number" min={0} max={100} placeholder="Potentiel minimal (0-100)" value={f.potentiel_min} onChange={(e) => set({ potentiel_min: e.target.value })} />
          </div>
          <p className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-brand-600" />{estimation === null ? 'Estimation indisponible' : <span><strong>{estimation}</strong> client(s) correspondent aux critères</span>}</p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Annuler</Button>
        <Button variant="brand" disabled={occupe || !pret} onClick={enregistrer}>{occupe && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{initiale ? 'Enregistrer' : 'Créer en brouillon'}</Button>
      </div>
    </div>
  );
}
