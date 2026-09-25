'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi, fcfa } from '@/components/ui/kpi';
import { collecteApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg, telecharger } from '@/lib/apiHelpers';
import { formatDate, formatDateTime } from '@/lib/utils';

const STATUT: Record<string, { l: string; v: 'outline' | 'warning' | 'info' | 'success' | 'destructive' }> = {
  ouverte: { l: 'Ouverte', v: 'outline' }, cloturee: { l: 'À contrôler', v: 'warning' }, controlee: { l: 'À rapprocher', v: 'info' }, rapprochee: { l: 'Rapprochée', v: 'success' }, rejetee: { l: 'Rejetée', v: 'destructive' },
};

export default function JourneesCollectePage() {
  const { can } = useCan();
  const [items, setItems] = useState<any[]>([]);
  const [statut, setStatut] = useState('');
  const [choisie, setChoisie] = useState<any>(null);
  const [verse, setVerse] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try { setItems((await collecteApi.journees({ statut: statut || undefined, per_page: 50 })).items); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Chargement impossible')); }
    finally { setChargement(false); }
  }, [statut]);
  useEffect(() => { void charger(); }, [charger]);

  const ouvrir = async (id: number) => { try { setChoisie(await collecteApi.journee(id)); setVerse(''); } catch (e) { toast.error(msg(e)); } };
  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupe(true);
    try { await fn(); toast.success(ok); await charger(); if (choisie) await ouvrir(choisie.id); } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); }
  };

  const aControler = items.filter((j) => j.statut === 'cloturee').length;
  const aRapprocher = items.filter((j) => j.statut === 'controlee').length;
  const ecarts = items.filter((j) => j.ecart != null && Number(j.ecart) !== 0);

  return (
    <div className="space-y-4">
      <EnTete titre="Journées de collecte" sousTitre="Clôture par le collecteur, contrôle par le superviseur, rapprochement par la caisse" />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="À contrôler" valeur={aControler} ton={aControler > 0 ? 'alerte' : undefined} />
        <Kpi label="À rapprocher" valeur={aRapprocher} ton={aRapprocher > 0 ? 'alerte' : undefined} />
        <Kpi label="Avec écart" valeur={ecarts.length} precision={ecarts.length ? fcfa(ecarts.reduce((s, j) => s + Number(j.ecart), 0)) : undefined} ton={ecarts.length ? 'mauvais' : 'bon'} />
      </div>
      <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUT).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-0">
          {erreur ? <p className="p-6 text-sm text-destructive">{erreur}</p> : chargement ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : items.length === 0 ? <p className="p-6 text-sm text-muted-foreground text-center">Aucune journée.</p> : (
            <table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Collecteur</th><th className="px-3 py-2 text-right">Collecté</th><th className="px-3 py-2 text-right">Écart</th><th className="px-3 py-2 text-left">Statut</th></tr></thead>
              <tbody>{items.map((j) => (
                <tr key={j.id} className={`border-t cursor-pointer hover:bg-muted/50 ${choisie?.id === j.id ? 'bg-brand-50' : ''}`} onClick={() => ouvrir(j.id)}>
                  <td className="px-3 py-2">{formatDate(j.date)}</td><td className="px-3 py-2">{j.agent.utilisateur.prenom} {j.agent.utilisateur.nom}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fcfa(j.totalCollecte)}<span className="text-xs text-muted-foreground"> ({j.nbOperations})</span></td>
                  <td className={`px-3 py-2 text-right tabular-nums ${j.ecart && Number(j.ecart) !== 0 ? 'text-destructive font-medium' : ''}`}>{j.ecart != null ? fcfa(j.ecart) : '—'}</td>
                  <td className="px-3 py-2"><Badge variant={STATUT[j.statut].v}>{STATUT[j.statut].l}</Badge></td></tr>))}</tbody></table>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-4 space-y-3">
          {!choisie ? <p className="text-sm text-muted-foreground py-6 text-center">Sélectionnez une journée.</p> : (
            <>
              <div className="flex items-center justify-between"><h2 className="font-semibold">{choisie.agent.utilisateur.prenom} {choisie.agent.utilisateur.nom} · {formatDate(choisie.date)}</h2><Badge variant={STATUT[choisie.statut].v}>{STATUT[choisie.statut].l}</Badge></div>
              <p className="text-sm">Total collecté : <strong>{fcfa(choisie.totalCollecte)}</strong> en {choisie.nbOperations} opération(s)
                {choisie.montantVerse != null && <> · versé <strong>{fcfa(choisie.montantVerse)}</strong> · écart <strong className={Number(choisie.ecart) !== 0 ? 'text-destructive' : ''}>{fcfa(choisie.ecart)}</strong></>}</p>
              {choisie.controlePar && <p className="text-xs text-muted-foreground">Contrôlée par {choisie.controlePar.prenom} {choisie.controlePar.nom} le {formatDateTime(choisie.controleAt)}{choisie.commentaireControle ? ` : ${choisie.commentaireControle}` : ''}</p>}
              {choisie.rapprochePar && <p className="text-xs text-muted-foreground">Rapprochée par {choisie.rapprochePar.prenom} {choisie.rapprochePar.nom}</p>}

              {choisie.statut === 'cloturee' && can('collecte:APPROVE', 'collecte:REJECT') && (
                <div className="flex gap-2"><Button size="sm" variant="success" disabled={occupe} onClick={() => agir(() => collecteApi.controler(choisie.id, 'controlee'), 'Journée contrôlée')}>Valider le contrôle</Button>
                  <Button size="sm" variant="destructive" disabled={occupe} onClick={() => { const c = window.prompt('Motif du rejet ?'); if (c?.trim()) void agir(() => collecteApi.controler(choisie.id, 'rejetee', c.trim()), 'Journée rejetée'); }}>Rejeter</Button></div>
              )}
              {choisie.statut === 'rejetee' && can('collecte:UPDATE') && <Button size="sm" variant="outline" disabled={occupe} onClick={() => agir(() => collecteApi.rouvrir(choisie.id), 'Journée rouverte')}>Rouvrir pour correction</Button>}
              {choisie.statut === 'controlee' && can('collecte:EXECUTE') && (
                <div className="flex items-end gap-2"><div className="space-y-1"><label className="text-xs text-muted-foreground">Montant réellement versé en caisse</label><Input type="number" min={0} className="w-48" value={verse} onChange={(e) => setVerse(e.target.value)} /></div>
                  <Button size="sm" variant="brand" disabled={occupe || verse === ''} onClick={() => agir(() => collecteApi.rapprocher(choisie.id, Number(verse)), 'Journée rapprochée')}>Rapprocher</Button></div>
              )}

              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs"><thead className="bg-muted sticky top-0 text-muted-foreground"><tr><th className="px-2 py-1.5 text-left">Reçu</th><th className="px-2 py-1.5 text-left">Client</th><th className="px-2 py-1.5 text-right">Montant</th><th /></tr></thead>
                  <tbody>{choisie.transactions.map((t: any) => (
                    <tr key={t.id} className="border-t"><td className="px-2 py-1">{t.recuNumero}</td><td className="px-2 py-1">{t.compte.client.prenom} {t.compte.client.nom}</td><td className="px-2 py-1 text-right tabular-nums">{fcfa(t.montant)}</td>
                      <td className="px-2 py-1"><button title="Reçu PDF" onClick={() => telecharger(`/collecte/recus/${t.id}/pdf`, undefined, true).catch((e) => toast.error(msg(e)))}><Download className="h-3.5 w-3.5" /></button></td></tr>))}</tbody></table>
              </div>
            </>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
