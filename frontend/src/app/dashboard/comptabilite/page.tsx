'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi, Onglets, fcfa } from '@/components/ui/kpi';
import { comptaApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg, telecharger } from '@/lib/apiHelpers';
import { formatDate } from '@/lib/utils';

type Onglet = 'journal' | 'balance' | 'etats' | 'saisie' | 'rapprochement' | 'periodes';
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const debutAnnee = () => `${new Date().getFullYear()}-01-01`;

export default function ComptabilitePage() {
  const { can } = useCan();
  const [onglet, setOnglet] = useState<Onglet>('journal');
  const [du, setDu] = useState(debutAnnee());
  const [au, setAu] = useState(aujourdhui());

  return (
    <div className="space-y-4">
      <EnTete titre="Comptabilité" sousTitre="Journal, balance, états financiers, rapprochement bancaire et export vers le système comptable">
        {can('comptabilite:EXPORT') && <Button variant="outline" onClick={() => telecharger(`/comptabilite/export?du=${du}&au=${au}`, `export-comptable-${du}-${au}.csv`).catch((e) => toast.error(msg(e)))}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>}
      </EnTete>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Période</span><Input type="date" className="w-40" value={du} onChange={(e) => setDu(e.target.value)} /><span>au</span><Input type="date" className="w-40" value={au} onChange={(e) => setAu(e.target.value)} />
      </div>
      <Onglets valeur={onglet} onChange={setOnglet} options={[
        { id: 'journal', label: 'Journal' }, { id: 'balance', label: 'Balance' }, { id: 'etats', label: 'États financiers' },
        ...(can('comptabilite:CREATE') ? [{ id: 'saisie' as Onglet, label: 'Écriture manuelle' }] : []),
        ...(can('comptabilite:UPDATE') ? [{ id: 'rapprochement' as Onglet, label: 'Rapprochement bancaire' }] : []),
        { id: 'periodes', label: 'Périodes' },
      ]} />
      {onglet === 'journal' && <Journal du={du} au={au} />}
      {onglet === 'balance' && <Balance du={du} au={au} />}
      {onglet === 'etats' && <Etats du={du} au={au} />}
      {onglet === 'saisie' && <Saisie />}
      {onglet === 'rapprochement' && <Rapprochement />}
      {onglet === 'periodes' && <Periodes />}
    </div>
  );
}

function Journal({ du, au }: { du: string; au: string }) {
  const { can } = useCan();
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const charger = useCallback(async () => {
    setChargement(true);
    try { const r = await comptaApi.journal({ du, au, page, per_page: 25 }); setItems(r.items); setTotal(r.meta.total ?? 0); setErreur(null); } catch (e) { setErreur(msg(e)); } finally { setChargement(false); }
  }, [du, au, page]);
  useEffect(() => { void charger(); }, [charger]);
  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  if (chargement) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Aucune écriture sur la période.</p>}
      {items.map((e) => (
        <Card key={e.id}><CardContent className="p-3 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{e.numeroPiece} · {e.libelle}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">{formatDate(e.dateOperation)}<Badge variant="outline">{e.journal.replace('_', ' ')}</Badge>{e.exporteAt && <Badge variant="success">Exportée</Badge>}
              {can('comptabilite:APPROVE') && <button title="Annuler" className="text-destructive" onClick={async () => { const m = window.prompt("Motif de l'annulation ?"); if (m && m.trim().length >= 5) { try { await comptaApi.annulerEcriture(e.id, m.trim()); toast.success('Écriture annulée'); await charger(); } catch (x) { toast.error(msg(x)); } } }}><Trash2 className="h-3.5 w-3.5" /></button>}</span></div>
          <table className="w-full text-xs"><tbody>{e.lignes.map((l: any) => (
            <tr key={l.id}><td className="py-0.5 w-20 text-muted-foreground">{l.compte.numero}</td><td>{l.compte.libelle}</td><td className="text-right tabular-nums w-32">{l.sens === 'debit' ? fcfa(l.montant) : ''}</td><td className="text-right tabular-nums w-32">{l.sens === 'credit' ? fcfa(l.montant) : ''}</td></tr>))}</tbody></table>
        </CardContent></Card>
      ))}
      {total > 25 && <div className="flex justify-end gap-2 text-sm"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button><span>Page {page} / {Math.ceil(total / 25)}</span><Button variant="outline" size="sm" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Suivant</Button></div>}
    </div>
  );
}

function Balance({ du, au }: { du: string; au: string }) {
  const [b, setB] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => { comptaApi.balance({ du, au }).then((r) => { setB(r); setErreur(null); }).catch((e) => setErreur(msg(e))); }, [du, au]);
  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  if (!b) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3"><Kpi label="Total débit" valeur={fcfa(b.total_debit)} /><Kpi label="Total crédit" valeur={fcfa(b.total_credit)} /><Kpi label="Équilibre" valeur={b.equilibree ? 'Équilibrée' : 'DÉSÉQUILIBRÉE'} ton={b.equilibree ? 'bon' : 'mauvais'} /></div>
      <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Compte</th><th className="px-3 py-2 text-left">Libellé</th><th className="px-3 py-2 text-right">Débit</th><th className="px-3 py-2 text-right">Crédit</th><th className="px-3 py-2 text-right">Solde</th></tr></thead>
        <tbody>{b.comptes.map((c: any) => (<tr key={c.id} className="border-t"><td className="px-3 py-1.5">{c.numero}</td><td className="px-3 py-1.5">{c.libelle}</td><td className="px-3 py-1.5 text-right tabular-nums">{fcfa(c.debit)}</td><td className="px-3 py-1.5 text-right tabular-nums">{fcfa(c.credit)}</td><td className="px-3 py-1.5 text-right tabular-nums font-medium">{fcfa(c.solde)}</td></tr>))}</tbody></table></CardContent></Card>
    </div>
  );
}

function Etats({ du, au }: { du: string; au: string }) {
  const [e, setE] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => { comptaApi.etats({ du, au }).then((r) => { setE(r); setErreur(null); }).catch((x) => setErreur(msg(x))); }, [du, au]);
  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  if (!e) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const Bloc = ({ titre, lignes, total }: { titre: string; lignes: any[]; total: number }) => (
    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{titre}</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
      {lignes.length === 0 && <p className="text-muted-foreground">—</p>}{lignes.map((l, i) => <div key={i} className="flex justify-between"><span>{l.numero} {l.libelle}</span><span className="tabular-nums">{fcfa(l.montant)}</span></div>)}
      <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{fcfa(total)}</span></div></CardContent></Card>
  );
  return (
    <div className="space-y-3">
      <p className="text-xs text-warning-700">{e.avertissement}</p>
      <div className="grid grid-cols-3 gap-3"><Kpi label="Produits" valeur={fcfa(e.compte_de_resultat.total_produits)} /><Kpi label="Charges" valeur={fcfa(e.compte_de_resultat.total_charges)} /><Kpi label="Résultat de la période" valeur={fcfa(e.compte_de_resultat.resultat)} ton={e.compte_de_resultat.resultat >= 0 ? 'bon' : 'mauvais'} /></div>
      <h3 className="font-semibold pt-2">Compte de résultat ({e.periode.du} au {e.periode.au})</h3>
      <div className="grid md:grid-cols-2 gap-3"><Bloc titre="Charges" lignes={e.compte_de_resultat.charges} total={e.compte_de_resultat.total_charges} /><Bloc titre="Produits" lignes={e.compte_de_resultat.produits} total={e.compte_de_resultat.total_produits} /></div>
      <h3 className="font-semibold pt-2">Bilan au {e.periode.au} {e.bilan.equilibre ? <Badge variant="success">équilibré</Badge> : <Badge variant="destructive">déséquilibré</Badge>}</h3>
      <div className="grid md:grid-cols-2 gap-3"><Bloc titre="Actif" lignes={e.bilan.actif} total={e.bilan.total_actif} /><Bloc titre="Passif" lignes={e.bilan.passif} total={e.bilan.total_passif} /></div>
    </div>
  );
}

function Saisie() {
  const [f, setF] = useState({ date: aujourdhui(), libelle: '', journal: 'operations_diverses' });
  const [lignes, setLignes] = useState([{ compte: '', sens: 'debit', montant: 0 }, { compte: '', sens: 'credit', montant: 0 }]);
  const [plan, setPlan] = useState<any[]>([]);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { comptaApi.plan().then(setPlan).catch(() => setPlan([])); }, []);
  const d = lignes.filter((l) => l.sens === 'debit').reduce((s, l) => s + l.montant, 0);
  const c = lignes.filter((l) => l.sens === 'credit').reduce((s, l) => s + l.montant, 0);
  const equilibre = d > 0 && Math.abs(d - c) < 0.005;
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /><Input className="sm:col-span-2" placeholder="Libellé" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} /></div>
      {lignes.map((l, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <select className="col-span-6 h-10 rounded-lg border bg-background px-2 text-sm" value={l.compte} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, compte: e.target.value } : x)))}><option value="">Compte…</option>{plan.map((p) => <option key={p.id} value={p.numero}>{p.numero} {p.libelle}</option>)}</select>
          <select className="col-span-2 h-10 rounded-lg border bg-background px-2 text-sm" value={l.sens} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, sens: e.target.value } : x)))}><option value="debit">Débit</option><option value="credit">Crédit</option></select>
          <Input className="col-span-3" type="number" min={0} value={l.montant || ''} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, montant: Number(e.target.value) } : x)))} />
          <button className="col-span-1 text-muted-foreground hover:text-destructive" disabled={lignes.length <= 2} onClick={() => setLignes(lignes.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setLignes([...lignes, { compte: '', sens: 'debit', montant: 0 }])}><Plus className="h-4 w-4 mr-1" />Ajouter une ligne</Button>
        <p className={`text-sm ${equilibre ? 'text-success-700' : 'text-destructive'}`}>Débit {fcfa(d)} · Crédit {fcfa(c)} {equilibre ? '· équilibrée' : '· déséquilibrée'}</p>
      </div>
      <Button variant="brand" disabled={occupe || !equilibre || !f.libelle.trim() || lignes.some((l) => !l.compte)} onClick={async () => { setOccupe(true); try { await comptaApi.ecriture({ ...f, lignes }); toast.success('Écriture enregistrée'); setF({ ...f, libelle: '' }); setLignes(lignes.map((l) => ({ ...l, montant: 0 }))); } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); } }}>Enregistrer l'écriture</Button>
    </CardContent></Card>
  );
}

function Rapprochement() {
  const [releves, setReleves] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [imp, setImp] = useState({ banque: '', csv: '' });
  const [occupe, setOccupe] = useState(false);
  const charger = useCallback(async () => { try { setReleves(await comptaApi.releves()); } catch (e) { toast.error(msg(e)); } }, []);
  useEffect(() => { void charger(); }, [charger]);
  const ouvrir = async (id: number) => { try { setDetail(await comptaApi.releve(id)); } catch (e) { toast.error(msg(e)); } };
  const S: Record<string, 'success' | 'warning' | 'destructive'> = { rapprochee: 'success', non_rapprochee: 'warning', ecart: 'destructive' };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <Card><CardHeader><CardTitle className="text-base">Importer un relevé</CardTitle></CardHeader><CardContent className="space-y-2">
          <Input placeholder="Banque" value={imp.banque} onChange={(e) => setImp({ ...imp, banque: e.target.value })} />
          <Textarea rows={6} className="font-mono text-xs" placeholder={'date;libellé;montant;référence\n2026-09-21;Versement espèces;250000;REF1\n2026-09-22;Frais de tenue;-1500;'} value={imp.csv} onChange={(e) => setImp({ ...imp, csv: e.target.value })} />
          <p className="text-xs text-muted-foreground">Montants positifs pour les entrées en banque, négatifs pour les sorties.</p>
          <Button variant="brand" size="sm" disabled={occupe || !imp.banque || !imp.csv.trim()} onClick={async () => { setOccupe(true); try { const r = await comptaApi.importerReleve(imp); toast.success(`${r.nb_lignes} ligne(s) importée(s)`); setImp({ banque: '', csv: '' }); await charger(); await ouvrir(r.id); } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); } }}><Upload className="h-4 w-4 mr-1.5" />Importer</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Relevés</CardTitle></CardHeader><CardContent className="space-y-1.5">
          {releves.length === 0 && <p className="text-sm text-muted-foreground">Aucun relevé.</p>}
          {releves.map((r) => (<button key={r.id} onClick={() => ouvrir(r.id)} className="w-full flex items-center justify-between rounded-md border p-2 text-left text-sm hover:bg-muted"><span>{r.banque} · {r._count.lignes} ligne(s)</span><span className="text-xs text-muted-foreground">{r.statuts.rapprochee ?? 0} rapprochée(s) · {r.statuts.non_rapprochee ?? 0} en attente</span></button>))}
        </CardContent></Card>
      </div>
      <Card><CardContent className="p-4 space-y-3">
        {!detail ? <p className="text-sm text-muted-foreground text-center py-8">Sélectionnez un relevé.</p> : (<>
          <div className="flex items-center justify-between"><h3 className="font-semibold">{detail.banque}</h3>
            <Button size="sm" variant="brand" onClick={async () => { try { const r = await comptaApi.rapprocher(detail.id); toast.success(`${r.rapprochees} ligne(s) rapprochée(s), ${r.restantes} restante(s)`); await ouvrir(detail.id); await charger(); } catch (e) { toast.error(msg(e)); } }}>Rapprochement automatique</Button></div>
          <table className="w-full text-xs"><tbody>{detail.lignes.map((l: any) => (
            <tr key={l.id} className="border-t"><td className="py-1.5">{formatDate(l.dateOperation)}</td><td>{l.libelle}</td><td className="text-right tabular-nums">{fcfa(l.montant)}</td><td className="pl-2"><Badge variant={S[l.statut]}>{l.statut.replace('_', ' ')}</Badge></td><td className="text-muted-foreground pl-2">{l.ecriture?.numeroPiece}</td></tr>))}</tbody></table>
          {detail.ecritures_non_rapprochees.length > 0 && (<div><p className="text-sm font-medium">Écritures de banque sans ligne de relevé ({detail.ecritures_non_rapprochees.length})</p>{detail.ecritures_non_rapprochees.map((e: any) => <p key={e.id} className="text-xs text-muted-foreground">{e.numeroPiece} · {e.libelle} · {formatDate(e.dateOperation)}</p>)}</div>)}
        </>)}
      </CardContent></Card>
    </div>
  );
}

function Periodes() {
  const { can } = useCan();
  const [p, setP] = useState<any[]>([]);
  const charger = useCallback(async () => { try { setP(await comptaApi.periodes()); } catch (e) { toast.error(msg(e)); } }, []);
  useEffect(() => { void charger(); }, [charger]);
  const [poussee, setPoussee] = useState(false);
  return (
    <div className="space-y-3">
      {can('comptabilite:EXECUTE') && <Button variant="outline" size="sm" disabled={poussee} onClick={async () => { setPoussee(true); try { const r = await comptaApi.pousser(); toast.success(`${r.transmises} écriture(s) transmise(s) au système comptable`); } catch (e) { toast.error(msg(e)); } finally { setPoussee(false); } }}>Transmettre les écritures au système comptable</Button>}
      <Card><CardContent className="p-0"><table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Période</th><th className="px-3 py-2 text-right">Écritures</th><th className="px-3 py-2 text-left">Statut</th><th /></tr></thead>
        <tbody>{p.map((x) => (<tr key={x.periode} className="border-t"><td className="px-3 py-2">{x.periode}</td><td className="px-3 py-2 text-right">{x.nb_ecritures}</td><td className="px-3 py-2"><Badge variant={x.cloturee ? 'secondary' : 'outline'}>{x.cloturee ? 'Clôturée' : 'Ouverte'}</Badge></td>
          <td className="px-3 py-2 text-right">{can('comptabilite:APPROVE') && (x.cloturee
            ? <Button size="sm" variant="ghost" onClick={async () => { const m = window.prompt('Motif de la réouverture ?'); if (m && m.trim().length >= 5) { try { await comptaApi.rouvrir(x.periode, m.trim()); await charger(); } catch (e) { toast.error(msg(e)); } } }}>Rouvrir</Button>
            : <Button size="sm" variant="outline" onClick={async () => { try { await comptaApi.cloturer(x.periode); toast.success(`Période ${x.periode} clôturée`); await charger(); } catch (e) { toast.error(msg(e)); } }}>Clôturer</Button>)}</td></tr>))}</tbody></table></CardContent></Card>
      <p className="text-xs text-muted-foreground">Une période clôturée n'accepte plus d'écriture. Seule une période échue peut être clôturée, et seulement si elle est équilibrée.</p>
    </div>
  );
}
