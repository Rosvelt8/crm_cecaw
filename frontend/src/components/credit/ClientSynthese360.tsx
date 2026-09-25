'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fcfa } from '@/components/ui/kpi';
import { clientService } from '@/services/clientService';
import { adminService, type MarcheRef, type SecteurRef } from '@/services/adminService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDate } from '@/lib/utils';

const CYCLE_LABEL: Record<string, string> = { nouveau: 'Nouveau', actif: 'Actif', dormant: 'Dormant', a_risque: 'À risque', premium: 'Premium' };
const CYCLE_TONE: Record<string, 'info' | 'success' | 'warning' | 'destructive'> = { nouveau: 'info', actif: 'success', dormant: 'warning', a_risque: 'destructive', premium: 'success' };
const OBJ_TYPE_LABEL: Record<string, string> = { financier: 'Financier', professionnel: 'Professionnel', personnel: 'Personnel' };

/**
 * Vue 360° assemblée (compléments stratégiques, points 1, 11, 12, 13, 19-20) : score et cycle de
 * vie, échéances/impayés de crédit et recouvrement en cours, objectifs personnels du client.
 * Chaque bloc agrège des données déjà stockées par les modules crédit/recouvrement/segmentation ;
 * aucun nouveau calcul métier n'est refait ici.
 */
interface ProfilTerritorial {
  marche: { id: number; nom: string; type: string } | null;
  secteur: { id: number; nom: string } | null;
  metier: { id: number; nom: string } | null;
}

export default function ClientSynthese360({ clientId, score, profil, onProfilChange }: {
  clientId: number;
  score: { score: number; potentiel: number; cycleVie: string; calculeAt: string } | null;
  profil: ProfilTerritorial;
  onProfilChange?: () => void;
}) {
  const { can } = useCan();
  const voir = can('crm:VIEW');
  const peutModifier = can('crm:UPDATE');
  const [synthese, setSynthese] = useState<any>(null);
  const [objectifs, setObjectifs] = useState<any[] | null>(null);
  const [formulaire, setFormulaire] = useState(false);
  const [type, setType] = useState('personnel');
  const [titre, setTitre] = useState('');
  const [montant, setMontant] = useState('');
  const [dateCible, setDateCible] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const [editionProfil, setEditionProfil] = useState(false);
  const [marches, setMarches] = useState<MarcheRef[]>([]);
  const [secteurs, setSecteurs] = useState<SecteurRef[]>([]);
  const [marcheId, setMarcheId] = useState(profil.marche ? String(profil.marche.id) : '');
  const [secteurId, setSecteurId] = useState(profil.secteur ? String(profil.secteur.id) : '');
  const [metierId, setMetierId] = useState(profil.metier ? String(profil.metier.id) : '');

  const chargerObjectifs = useCallback(async () => {
    try { setObjectifs(await clientService.getObjectifsPersonnels(clientId)); } catch { setObjectifs(null); }
  }, [clientId]);

  useEffect(() => {
    if (!voir) return;
    clientService.getSynthese(clientId).then(setSynthese).catch(() => setSynthese(null));
    void chargerObjectifs();
  }, [clientId, voir, chargerObjectifs]);

  const ouvrirEditionProfil = () => {
    setEditionProfil(true);
    if (marches.length === 0) adminService.marches().then(setMarches).catch(() => {});
    if (secteurs.length === 0) adminService.secteurs().then(setSecteurs).catch(() => {});
  };

  const enregistrerProfil = async () => {
    setEnvoi(true);
    try {
      await clientService.update(clientId, { marche_id: marcheId ? Number(marcheId) : null, secteur_id: secteurId ? Number(secteurId) : null, metier_id: metierId ? Number(metierId) : null });
      toast.success('Profil territorial mis à jour'); setEditionProfil(false); onProfilChange?.();
    } catch (e) { toast.error(msg(e)); } finally { setEnvoi(false); }
  };

  const metiersDuSecteur = secteurs.find((s) => String(s.id) === secteurId)?.metiers ?? [];

  if (!voir) return null;

  const creerObjectif = async () => {
    if (!titre.trim()) { toast.error('Titre requis'); return; }
    setEnvoi(true);
    try {
      await clientService.creerObjectifPersonnel(clientId, { type, titre: titre.trim(), montant_cible: montant ? Number(montant) : null, date_cible: dateCible || null });
      toast.success('Objectif créé'); setTitre(''); setMontant(''); setDateCible(''); setFormulaire(false);
      await chargerObjectifs();
    } catch (e) { toast.error(msg(e)); } finally { setEnvoi(false); }
  };

  const marquerAtteint = async (id: number) => {
    try { await clientService.modifierObjectifPersonnel(clientId, id, { statut: 'atteint' }); await chargerObjectifs(); }
    catch (e) { toast.error(msg(e)); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {score && (
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full border-4 border-brand-200 flex items-center justify-center font-bold text-lg text-brand-700">{score.score}</div>
                <div>
                  <Badge variant={CYCLE_TONE[score.cycleVie] ?? 'info'}>{CYCLE_LABEL[score.cycleVie] ?? score.cycleVie}</Badge>
                  <p className="text-xs text-muted-foreground mt-1">Potentiel commercial : {score.potentiel}/100 · calculé le {formatDate(score.calculeAt)}</p>
                </div>
              </div>
            )}
            {!editionProfil && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Marché : <span className="font-medium text-foreground">{profil.marche?.nom ?? 'non renseigné'}</span></p>
                <p>Secteur / métier : <span className="font-medium text-foreground">{profil.secteur?.nom ?? '—'}{profil.metier ? ` · ${profil.metier.nom}` : ''}</span></p>
              </div>
            )}
          </div>
          {peutModifier && !editionProfil && <Button size="sm" variant="outline" onClick={ouvrirEditionProfil}>Modifier le profil territorial</Button>}
        </CardContent>
        {editionProfil && (
          <CardContent className="pt-0 space-y-2 border-t">
            <div className="grid sm:grid-cols-3 gap-2 pt-3">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={marcheId} onChange={(e) => setMarcheId(e.target.value)}>
                <option value="">Marché…</option>{marches.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={secteurId} onChange={(e) => { setSecteurId(e.target.value); setMetierId(''); }}>
                <option value="">Secteur…</option>{secteurs.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={metierId} onChange={(e) => setMetierId(e.target.value)} disabled={!secteurId}>
                <option value="">Métier…</option>{metiersDuSecteur.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditionProfil(false)}>Annuler</Button>
              <Button size="sm" variant="brand" disabled={envoi} onClick={enregistrerProfil}>Enregistrer</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {synthese && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Situation crédit</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {synthese.credits.length === 0 && <p className="text-muted-foreground">Aucun crédit.</p>}
              {synthese.credits.map((c: any) => (
                <div key={c.id} className="rounded-md border p-2 space-y-1">
                  <div className="flex items-center justify-between"><span className="font-medium">{c.reference}</span><Badge variant={c.nb_echeances_en_retard > 0 ? 'destructive' : 'success'}>{c.statut}</Badge></div>
                  <p className="text-xs text-muted-foreground">{c.produit} · {fcfa(c.montant)}</p>
                  {c.prochaine_echeance && <p className="text-xs">Prochaine échéance : {formatDate(c.prochaine_echeance.date)} · reste {fcfa(c.prochaine_echeance.reste)}</p>}
                  {c.nb_echeances_en_retard > 0 && <p className="text-xs text-destructive-700">{c.nb_echeances_en_retard} échéance(s) en retard, {fcfa(c.montant_en_retard)}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {synthese && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recouvrement</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {synthese.recouvrement.length === 0 && <p className="text-muted-foreground">Aucun dossier de recouvrement ouvert.</p>}
              {synthese.recouvrement.map((d: any) => (
                <div key={d.id} className="rounded-md border p-2 space-y-1">
                  <div className="flex items-center justify-between"><span className="font-medium">{d.reference}</span><Badge variant="destructive">{d.jours_retard} j de retard</Badge></div>
                  <p className="text-xs text-muted-foreground">{fcfa(d.montant_impaye)} impayé · niveau de relance {d.niveau_relance}</p>
                  {d.derniere_promesse && <p className="text-xs">Promesse : {fcfa(d.derniere_promesse.montant)} le {formatDate(d.derniere_promesse.date_promise)} ({d.derniere_promesse.statut})</p>}
                  {d.prochaine_action_at && <p className="text-xs text-warning-700">Prochaine action : {formatDate(d.prochaine_action_at)}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Objectifs personnels{objectifs ? ` (${objectifs.length})` : ''}</CardTitle>
          {can('crm:CREATE', 'crm:UPDATE') && <Button size="sm" variant="outline" onClick={() => setFormulaire((v) => !v)}>Nouvel objectif</Button>}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {formulaire && (
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="grid grid-cols-3 gap-2">
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                  {Object.entries(OBJ_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <Input className="col-span-2" placeholder="Titre (ex. Acheter un frigo)" value={titre} onChange={(e) => setTitre(e.target.value)} />
                <Input type="number" min={0} placeholder="Montant cible" value={montant} onChange={(e) => setMontant(e.target.value)} />
                <Input type="date" className="col-span-2" value={dateCible} onChange={(e) => setDateCible(e.target.value)} title="Date cible" />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setFormulaire(false)}>Annuler</Button>
                <Button size="sm" variant="brand" disabled={envoi} onClick={creerObjectif}>Créer</Button>
              </div>
            </div>
          )}
          {objectifs?.length === 0 && <p className="text-muted-foreground">Aucun objectif personnel.</p>}
          {objectifs?.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-md border p-2">
              <div>
                <span className="font-medium">{o.titre}</span>
                <p className="text-xs text-muted-foreground">{OBJ_TYPE_LABEL[o.type] ?? o.type}{o.montantCible ? ` · ${fcfa(o.montantCible)}` : ''}{o.dateCible ? ` · échéance ${formatDate(o.dateCible)}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={o.statut === 'atteint' ? 'success' : o.statut === 'abandonne' ? 'outline' : 'info'}>{o.statut === 'en_cours' ? 'En cours' : o.statut === 'atteint' ? 'Atteint' : 'Abandonné'}</Badge>
                {o.statut === 'en_cours' && can('crm:UPDATE') && <Button size="sm" variant="ghost" onClick={() => marquerAtteint(o.id)}>Marquer atteint</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
