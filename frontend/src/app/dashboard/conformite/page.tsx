'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi, Onglets } from '@/components/ui/kpi';
import { conformiteApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDateTime } from '@/lib/utils';

type Onglet = 'alertes' | 'listes' | 'verification';
const NIVEAU: Record<string, 'info' | 'warning' | 'destructive'> = { info: 'info', moyen: 'warning', eleve: 'destructive', critique: 'destructive' };

export default function ConformitePage() {
  const [onglet, setOnglet] = useState<Onglet>('alertes');
  return (
    <div className="space-y-4">
      <EnTete titre="Conformité" sousTitre="Alertes d'anomalies, listes de surveillance et contrôle LCB-FT" />
      <Onglets valeur={onglet} onChange={setOnglet} options={[{ id: 'alertes', label: 'Alertes' }, { id: 'listes', label: 'Listes de surveillance' }, { id: 'verification', label: 'Vérifier une personne' }]} />
      {onglet === 'alertes' && <Alertes />}
      {onglet === 'listes' && <Listes />}
      {onglet === 'verification' && <Verification />}
    </div>
  );
}

function Alertes() {
  const { can } = useCan();
  const [resume, setResume] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [statut, setStatut] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const charger = useCallback(async () => {
    setChargement(true);
    try { const [r, l] = await Promise.all([conformiteApi.resume(), conformiteApi.alertes({ statut: statut || undefined, per_page: 50 })]); setResume(r); setItems(l.items); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Accès refusé ou chargement impossible')); } finally { setChargement(false); }
  }, [statut]);
  useEffect(() => { void charger(); }, [charger]);

  const traiter = async (a: any, s: 'en_cours' | 'traitee' | 'fausse_alerte') => {
    let commentaire: string | undefined;
    if (s !== 'en_cours') { const c = window.prompt('Commentaire justifiant le traitement (5 caractères minimum) :'); if (!c || c.trim().length < 5) return; commentaire = c.trim(); }
    try { await conformiteApi.traiter(a.id, { statut: s, commentaire }); toast.success('Alerte mise à jour'); await charger(); } catch (e) { toast.error(msg(e)); }
  };

  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  return (
    <div className="space-y-3">
      {resume && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Critiques ouvertes" valeur={resume.critiques_ouvertes} ton={resume.critiques_ouvertes ? 'mauvais' : 'bon'} />
        <Kpi label="Niveau élevé" valeur={resume.par_niveau.eleve ?? 0} ton={resume.par_niveau.eleve ? 'alerte' : undefined} />
        <Kpi label="Niveau moyen" valeur={resume.par_niveau.moyen ?? 0} />
        <Kpi label="Traitées" valeur={resume.par_statut.traitee ?? 0} />
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Ouvertes et en cours</option><option value="traitee">Traitées</option><option value="fausse_alerte">Fausses alertes</option></select>
        {can('conformite:EXECUTE') && <Button variant="outline" size="sm" disabled={occupe} onClick={async () => { setOccupe(true); try { const r = await conformiteApi.analyser(); toast.success(`Analyse : ${r.fractionnement} fractionnement(s), ${r.clientsBloques} client(s) bloqué(s), ${r.piecesExpirees} pièce(s) expirée(s), ${r.ecartsCollecte} écart(s) de collecte`); await charger(); } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); } }}>Lancer l'analyse des anomalies</Button>}
      </div>
      {chargement ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">Aucune alerte.</p> : items.map((a) => (
        <Card key={a.id}><CardContent className="p-3 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 font-medium text-sm"><ShieldAlert className="h-4 w-4" />{a.titre}</span><span className="flex items-center gap-2"><Badge variant={NIVEAU[a.niveau]}>{a.niveau}</Badge><Badge variant="outline">{a.statut.replace('_', ' ')}</Badge></span></div>
          {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
          <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}{a.agence ? ` · ${a.agence.nom}` : ''} · règle « {a.code} »{a.traitePar ? ` · traitée par ${a.traitePar.prenom} ${a.traitePar.nom}` : ''}{a.commentaireTraitement ? ` : ${a.commentaireTraitement}` : ''}</p>
          {can('conformite:EXECUTE') && ['ouverte', 'en_cours'].includes(a.statut) && (
            <div className="flex gap-2 pt-1">{a.statut === 'ouverte' && <Button size="sm" variant="outline" onClick={() => traiter(a, 'en_cours')}>Prendre en charge</Button>}<Button size="sm" variant="brand" onClick={() => traiter(a, 'traitee')}>Clôturer</Button><Button size="sm" variant="ghost" onClick={() => traiter(a, 'fausse_alerte')}>Fausse alerte</Button></div>
          )}
        </CardContent></Card>
      ))}
    </div>
  );
}

function Listes() {
  const { can } = useCan();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ nom: '', prenom: '', numero_piece: '', categorie: 'interne', source: '' });
  const [csv, setCsv] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(async () => { try { setItems((await conformiteApi.listes({ search: search || undefined, per_page: 50 })).items); setErreur(null); } catch (e) { setErreur(msg(e)); } }, [search]);
  useEffect(() => { const t = setTimeout(charger, 250); return () => clearTimeout(t); }, [charger]);
  const edition = can('conformite:UPDATE', 'conformite:CONFIGURE');
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3">
        <Input className="max-w-xs" placeholder="Rechercher un nom…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {erreur ? <p className="text-destructive text-sm">{erreur}</p> : (
          <Card><CardContent className="p-0"><table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Nom</th><th className="px-3 py-2 text-left">Pièce</th><th className="px-3 py-2 text-left">Catégorie</th><th className="px-3 py-2 text-left">Source</th><th /></tr></thead>
            <tbody>{items.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Aucune entrée</td></tr>}
              {items.map((e) => (<tr key={e.id} className="border-t"><td className="px-3 py-1.5">{e.prenom} {e.nom}</td><td className="px-3 py-1.5">{e.numeroPiece ?? '—'}</td><td className="px-3 py-1.5"><Badge variant={e.categorie === 'sanction' ? 'destructive' : e.categorie === 'pep' ? 'warning' : 'outline'}>{e.categorie}</Badge></td><td className="px-3 py-1.5">{e.source ?? '—'}</td>
                <td className="px-3 py-1.5 text-right">{edition && <button className="text-destructive" onClick={async () => { if (window.confirm(`Retirer ${e.nom} de la liste ?`)) { try { await conformiteApi.supprimerEntree(e.id); await charger(); } catch (x) { toast.error(msg(x)); } } }}><Trash2 className="h-4 w-4" /></button>}</td></tr>))}</tbody></table></CardContent></Card>
        )}
      </div>
      {edition && (
        <div className="space-y-3">
          <Card><CardHeader><CardTitle className="text-base">Ajouter</CardTitle></CardHeader><CardContent className="space-y-2">
            <Input placeholder="Nom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /><Input placeholder="Prénom" value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} /><Input placeholder="N° de pièce" value={f.numero_piece} onChange={(e) => setF({ ...f, numero_piece: e.target.value })} />
            <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}><option value="interne">Liste interne</option><option value="pep">Personne politiquement exposée</option><option value="sanction">Sanction</option></select>
            <Input placeholder="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} />
            <Button variant="brand" size="sm" disabled={!f.nom.trim()} onClick={async () => { try { await conformiteApi.ajouterEntree({ ...f, prenom: f.prenom || null, numero_piece: f.numero_piece || null, source: f.source || null }); setF({ nom: '', prenom: '', numero_piece: '', categorie: 'interne', source: '' }); await charger(); } catch (e) { toast.error(msg(e)); } }}>Ajouter</Button>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Import en masse</CardTitle></CardHeader><CardContent className="space-y-2">
            <Textarea rows={5} className="font-mono text-xs" placeholder={'nom;prenom;numero_piece;pays;categorie;source'} value={csv} onChange={(e) => setCsv(e.target.value)} />
            <Button variant="outline" size="sm" disabled={csv.trim().length < 3} onClick={async () => { try { const r = await conformiteApi.importer(csv); toast.success(`${r.importees} importée(s), ${r.rejetees} rejetée(s)`); if (r.erreurs.length) toast.warning(r.erreurs.slice(0, 3).map((x: any) => `ligne ${x.ligne} : ${x.message}`).join(' · ')); setCsv(''); await charger(); } catch (e) { toast.error(msg(e)); } }}>Importer</Button>
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}

function Verification() {
  const [f, setF] = useState({ nom: '', prenom: '', numero_piece: '' });
  const [r, setR] = useState<any>(null);
  return (
    <Card className="max-w-xl"><CardContent className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">Recherche insensible à l'ordre des mots, aux accents et à la casse. Un numéro de pièce identique donne une correspondance certaine.</p>
      <Input placeholder="Nom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /><Input placeholder="Prénom" value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} /><Input placeholder="N° de pièce (facultatif)" value={f.numero_piece} onChange={(e) => setF({ ...f, numero_piece: e.target.value })} />
      <Button variant="brand" disabled={!f.nom.trim()} onClick={async () => { try { setR(await conformiteApi.verifier({ nom: f.nom, prenom: f.prenom || undefined, numero_piece: f.numero_piece || undefined })); } catch (e) { toast.error(msg(e)); } }}>Vérifier</Button>
      {r && (r.conforme ? <p className="text-sm text-success-700">Aucune correspondance sur les listes de surveillance.</p> : (
        <div className="space-y-1">{r.correspondances.map((c: any) => <p key={c.entreeId} className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm"><strong>{c.nom}</strong> · {c.categorie} · score {Math.round(c.score * 100)} % ({c.raison === 'piece' ? 'même pièce' : 'nom proche'}){c.motif ? ` · ${c.motif}` : ''}</p>)}</div>))}
    </CardContent></Card>
  );
}
