'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EnTete, Onglets } from '@/components/ui/kpi';
import { integrationApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDateTime } from '@/lib/utils';

type Onglet = 'webhooks' | 'journal';

export default function IntegrationsPage() {
  const [onglet, setOnglet] = useState<Onglet>('webhooks');
  return (
    <div className="space-y-4">
      <EnTete titre="Intégrations" sousTitre="Webhooks sortants signés et journal technique des échanges avec les systèmes externes" />
      <Onglets valeur={onglet} onChange={setOnglet} options={[{ id: 'webhooks', label: 'Webhooks' }, { id: 'journal', label: "Journal des échanges" }]} />
      {onglet === 'webhooks' ? <Webhooks /> : <Journal />}
    </div>
  );
}

function Webhooks() {
  const { can } = useCan();
  const modif = can('integration:CONFIGURE');
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState({ nom: '', url: '', evenements: '*' });
  const [secret, setSecret] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(async () => { try { setItems(await integrationApi.webhooks()); setErreur(null); } catch (e) { setErreur(msg(e, 'Accès refusé')); } }, []);
  useEffect(() => { void charger(); }, [charger]);
  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Aucun webhook.</p>}
        {items.map((w) => (
          <Card key={w.id}><CardContent className="p-3 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-sm">{w.nom}</span><span className="flex items-center gap-2"><Badge variant={w.actif ? 'success' : 'destructive'}>{w.actif ? 'Actif' : 'Suspendu'}</Badge>{w.echecsConsecutifs > 0 && <Badge variant="warning">{w.echecsConsecutifs} échec(s)</Badge>}</span></div>
            <p className="text-xs text-muted-foreground break-all">{w.url}</p><p className="text-xs">Événements : {w.evenements.join(', ')}</p>
            {modif && <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={async () => { try { const r = await integrationApi.testerWebhook(w.id); if (r.ok) toast.success('Test réussi'); else toast.error(`Échec : ${r.erreur ?? `HTTP ${r.statut_http}`}`); await charger(); } catch (e) { toast.error(msg(e)); } }}>Tester</Button>
              <Button size="sm" variant="ghost" onClick={async () => { try { await integrationApi.modifierWebhook(w.id, { actif: !w.actif }); await charger(); } catch (e) { toast.error(msg(e)); } }}>{w.actif ? 'Suspendre' : 'Réactiver'}</Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (window.confirm(`Supprimer « ${w.nom} » ?`)) { try { await integrationApi.supprimerWebhook(w.id); await charger(); } catch (e) { toast.error(msg(e)); } } }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>}
          </CardContent></Card>
        ))}
      </div>
      {modif && (
        <Card><CardHeader><CardTitle className="text-base">Nouveau webhook</CardTitle></CardHeader><CardContent className="space-y-2">
          <Input placeholder="Nom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /><Input placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <Input placeholder="Événements (séparés par des virgules, * pour tous)" value={f.evenements} onChange={(e) => setF({ ...f, evenements: e.target.value })} />
          <p className="text-xs text-muted-foreground">Exemples : credit.decaisse, credit.remboursement, recouvrement.escalade, kyc.traite.</p>
          <Button variant="brand" size="sm" disabled={!f.nom.trim() || !/^https?:\/\//.test(f.url)} onClick={async () => { try { const w = await integrationApi.creerWebhook({ nom: f.nom, url: f.url, evenements: f.evenements.split(',').map((x) => x.trim()).filter(Boolean) }); setSecret(w.secret); setF({ nom: '', url: '', evenements: '*' }); await charger(); } catch (e) { toast.error(msg(e)); } }}>Créer</Button>
          {secret && <div className="rounded-md border border-warning/40 bg-warning-50 p-2 space-y-1"><p className="text-xs text-warning-700">Secret de signature, affiché une seule fois. Le destinataire vérifie l'en-tête X-CECAW-Signature (HMAC-SHA256 du corps).</p><p className="font-mono text-xs break-all">{secret}</p><Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(secret); toast.success('Copié'); }}><Copy className="h-3.5 w-3.5 mr-1" />Copier</Button></div>}
        </CardContent></Card>
      )}
    </div>
  );
}

function Journal() {
  const [items, setItems] = useState<any[]>([]);
  const [systeme, setSysteme] = useState('');
  const [statut, setStatut] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => { integrationApi.journal({ systeme: systeme || undefined, statut: statut || undefined, per_page: 100 }).then((r) => { setItems(r.items); setErreur(null); }).catch((e) => setErreur(msg(e, 'Accès refusé'))); }, [systeme, statut]);
  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={systeme} onChange={(e) => setSysteme(e.target.value)}><option value="">Tous les systèmes</option><option value="sms">SMS</option><option value="webhook">Webhooks</option><option value="comptabilite">Comptabilité</option></select>
        <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Tous statuts</option><option value="ok">Réussis</option><option value="echec">Échecs</option></select></div>
      <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Système</th><th className="px-3 py-2 text-left">Référence</th><th className="px-3 py-2 text-left">Statut</th><th className="px-3 py-2 text-right">HTTP</th><th className="px-3 py-2 text-right">Durée</th></tr></thead>
        <tbody>{items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Aucun échange</td></tr>}
          {items.map((x) => (<tr key={x.id} className="border-t" title={`${x.requete ?? ''}\n→ ${x.reponse ?? ''}`}><td className="px-3 py-1.5 whitespace-nowrap">{formatDateTime(x.createdAt)}</td><td className="px-3 py-1.5">{x.systeme} <span className="text-xs text-muted-foreground">{x.direction}</span></td><td className="px-3 py-1.5">{x.reference ?? '—'}</td><td className="px-3 py-1.5"><Badge variant={x.statut === 'ok' ? 'success' : 'destructive'}>{x.statut}</Badge></td><td className="px-3 py-1.5 text-right">{x.codeHttp ?? '—'}</td><td className="px-3 py-1.5 text-right">{x.dureeMs != null ? `${x.dureeMs} ms` : '—'}</td></tr>))}</tbody></table></CardContent></Card>
    </div>
  );
}
