'use client';
/* eslint-disable react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EnTete, Onglets, fcfa } from '@/components/ui/kpi';
import { adminService, type MarcheRef, type SecteurRef, type PotentielMarche } from '@/services/adminService';
import { agenceService } from '@/services/agenceService';
import { agentService } from '@/services/agentService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';

interface AgenceOption { id: number; nom: string }
interface AgentOption { id: number; matricule: string; utilisateur?: { prenom: string; nom: string } }

const TYPE_LABEL: Record<string, string> = { grand: 'Grand marché', moyen: 'Marché moyen', petit: 'Petit marché' };
const nombre = (v: string) => (v.trim() === '' ? null : Number(v));

/**
 * Marchés (compléments stratégiques, points 15-16 : territoire et intelligence Bayam-Sellam) et
 * référentiel structuré secteurs/métiers (point 8), en remplacement progressif des champs libres.
 */
export default function MarchesPage() {
  const [onglet, setOnglet] = useState<'marches' | 'potentiel' | 'referentiel'>('marches');
  return (
    <div className="space-y-4">
      <EnTete titre="Marchés et activités" sousTitre="Grands, moyens et petits marchés (Bayam-Sellam), et référentiel structuré secteurs / métiers" />
      <Onglets valeur={onglet} onChange={setOnglet} options={[{ id: 'marches', label: 'Marchés' }, { id: 'potentiel', label: 'Potentiel de collecte' }, { id: 'referentiel', label: 'Secteurs et métiers' }]} />
      {onglet === 'marches' ? <Marches /> : onglet === 'potentiel' ? <Potentiel /> : <Referentiel />}
    </div>
  );
}

function Potentiel() {
  const [lignes, setLignes] = useState<PotentielMarche[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => { adminService.potentielMarches().then(setLignes).catch((e) => setErreur(msg(e, 'Accès refusé'))); }, []);

  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  if (!lignes) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Classement par opportunité (prospects non convertis + clients dormants), pas par une note composite opaque. Chaque indicateur reste lisible séparément.</p>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Marché</th><th className="px-3 py-2 text-right">Clients</th><th className="px-3 py-2 text-right">Prospects actifs</th><th className="px-3 py-2 text-right">Clients dormants</th><th className="px-3 py-2 text-right">Épargne collectée</th><th className="px-3 py-2 text-right">Potentiel moyen</th><th className="px-3 py-2 text-right">Collecteurs</th></tr>
          </thead>
          <tbody>
            {lignes.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Aucun marché défini</td></tr>}
            {lignes.map((l) => (
              <tr key={l.marche_id} className="border-t">
                <td className="px-3 py-2"><span className="font-medium">{l.nom}</span> <Badge variant={l.type === 'grand' ? 'brand' : l.type === 'moyen' ? 'info' : 'outline'}>{l.type}</Badge></td>
                <td className="px-3 py-2 text-right tabular-nums">{l.nb_clients}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.nb_prospects_actifs > 0 && <Badge variant="info">{l.nb_prospects_actifs}</Badge>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.nb_clients_dormants > 0 && <Badge variant="warning">{l.nb_clients_dormants}</Badge>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fcfa(l.epargne_collectee)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.potentiel_moyen_clients ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.nb_collecteurs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function Marches() {
  const { can } = useCan();
  const peutCreer = can('organisation:CREATE');
  const peutModifier = can('organisation:UPDATE');

  const [marches, setMarches] = useState<MarcheRef[]>([]);
  const [agences, setAgences] = useState<AgenceOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [form, setForm] = useState({ nom: '', type: 'petit' as 'grand' | 'moyen' | 'petit', agenceId: '', latitude: '', longitude: '' });
  const [editionId, setEditionId] = useState<number | null>(null);
  const [affectation, setAffectation] = useState<{ marche: MarcheRef; ids: Set<number> } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try { setMarches(await adminService.marches()); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Accès refusé')); }
    finally { setChargement(false); }
  }, []);

  useEffect(() => {
    void charger();
    agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {});
    agentService.getAgents({ per_page: 100 } as never).then((r: { data: AgentOption[] }) => setAgents(r.data)).catch(() => {});
  }, [charger]);

  const reinitialiserForm = () => { setForm({ nom: '', type: 'petit', agenceId: '', latitude: '', longitude: '' }); setEditionId(null); };

  const enregistrer = async () => {
    setOccupe(true);
    const payload = { nom: form.nom, type: form.type, agenceId: nombre(form.agenceId), latitude: nombre(form.latitude), longitude: nombre(form.longitude) };
    try {
      if (editionId) await adminService.modifierMarche(editionId, payload);
      else await adminService.creerMarche(payload);
      toast.success(editionId ? 'Marché modifié' : 'Marché créé'); reinitialiserForm(); await charger();
    } catch (e) { toast.error(msg(e, editionId ? 'Modification impossible' : 'Création impossible')); } finally { setOccupe(false); }
  };

  const editer = (m: MarcheRef) => {
    setEditionId(m.id);
    setForm({ nom: m.nom, type: m.type, agenceId: m.agenceId ? String(m.agenceId) : '', latitude: m.latitude ?? '', longitude: m.longitude ?? '' });
  };

  const supprimer = async (m: MarcheRef) => {
    if (!window.confirm(`Supprimer « ${m.nom} » ?`)) return;
    try { await adminService.supprimerMarche(m.id); toast.success('Marché supprimé'); await charger(); }
    catch (e) { toast.error(msg(e, 'Suppression impossible')); }
  };

  const enregistrerAffectation = async () => {
    if (!affectation) return;
    try {
      await adminService.affecterAgentsMarche(affectation.marche.id, [...affectation.ids].map((agent_id) => ({ agent_id })));
      toast.success('Affectation enregistrée'); setAffectation(null); await charger();
    } catch (e) { toast.error(msg(e, 'Affectation impossible')); }
  };

  if (chargement) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;
  if (erreur) return <p className="text-destructive">{erreur}</p>;

  return (
    <div className="space-y-4">
      {peutCreer && (
        <Card>
          <CardHeader><CardTitle className="text-base">{editionId ? 'Modifier le marché' : 'Nouveau marché'}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Nom</Label><Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex. Marché Congo" /></div>
              <div className="space-y-1.5"><Label>Taille</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>
                  {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
              <div className="space-y-1.5"><Label>Agence</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={form.agenceId} onChange={(e) => setForm({ ...form, agenceId: e.target.value })}><option value="">—</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Latitude</Label><Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Longitude</Label><Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <Button variant="brand" disabled={occupe || !form.nom.trim()} onClick={enregistrer}>
                {editionId ? <Check className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}{editionId ? 'Enregistrer les modifications' : 'Créer le marché'}
              </Button>
              {editionId && <Button variant="ghost" onClick={reinitialiserForm}>Annuler</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Marché</th><th className="px-3 py-2 text-left">Agence</th><th className="px-3 py-2 text-left">Collecteurs</th><th className="px-3 py-2 text-right">Clients</th><th className="px-3 py-2 text-right">Prospects</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {marches.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Aucun marché défini</td></tr>}
            {marches.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2"><span className="font-medium">{m.nom}</span> <Badge variant={m.type === 'grand' ? 'brand' : m.type === 'moyen' ? 'info' : 'outline'}>{TYPE_LABEL[m.type]}</Badge></td>
                <td className="px-3 py-2">{m.agence?.nom ?? '—'}</td>
                <td className="px-3 py-2">{m.agents.length === 0 ? '—' : m.agents.map((a) => a.agent.utilisateur ? `${a.agent.utilisateur.prenom} ${a.agent.utilisateur.nom}` : a.agent.matricule).join(', ')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m._count.clients}</td><td className="px-3 py-2 text-right tabular-nums">{m._count.prospects}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {peutModifier && <Button size="sm" variant="ghost" onClick={() => setAffectation({ marche: m, ids: new Set(m.agents.map((a) => a.agent.id)) })}>Collecteurs</Button>}
                  {peutModifier && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => editer(m)}><Pencil className="h-3.5 w-3.5" /></Button>}
                  {peutModifier && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => supprimer(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {affectation && (
        <Card>
          <CardHeader><CardTitle className="text-base">Collecteurs de « {affectation.marche.nom} »</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
              {agents.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                  <input type="checkbox" checked={affectation.ids.has(a.id)} onChange={() => setAffectation((s) => { if (!s) return s; const ids = new Set(s.ids); if (ids.has(a.id)) ids.delete(a.id); else ids.add(a.id); return { ...s, ids }; })} />
                  {a.utilisateur ? `${a.utilisateur.prenom} ${a.utilisateur.nom}` : a.matricule}
                </label>
              ))}
            </div>
            <div className="flex gap-2"><Button variant="brand" onClick={enregistrerAffectation}>Enregistrer</Button><Button variant="ghost" onClick={() => setAffectation(null)}>Annuler</Button></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Referentiel() {
  const { can } = useCan();
  const peutConfigurer = can('organisation:CREATE', 'organisation:UPDATE');
  const [secteurs, setSecteurs] = useState<SecteurRef[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauSecteur, setNouveauSecteur] = useState('');
  const [nouveauMetier, setNouveauMetier] = useState<Record<number, string>>({});
  const [editionSecteur, setEditionSecteur] = useState<{ id: number; nom: string } | null>(null);
  const [editionMetier, setEditionMetier] = useState<{ id: number; nom: string } | null>(null);

  const charger = useCallback(async () => {
    try { setSecteurs(await adminService.secteurs()); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Accès refusé')); }
    finally { setChargement(false); }
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  const creerSecteur = async () => {
    if (!nouveauSecteur.trim()) return;
    try { await adminService.creerSecteur(nouveauSecteur.trim()); setNouveauSecteur(''); toast.success('Secteur créé'); await charger(); }
    catch (e) { toast.error(msg(e)); }
  };
  const creerMetier = async (secteurId: number) => {
    const nom = (nouveauMetier[secteurId] ?? '').trim();
    if (!nom) return;
    try { await adminService.creerMetier(nom, secteurId); setNouveauMetier({ ...nouveauMetier, [secteurId]: '' }); toast.success('Métier créé'); await charger(); }
    catch (e) { toast.error(msg(e)); }
  };
  const renommerSecteur = async () => {
    if (!editionSecteur || !editionSecteur.nom.trim()) return;
    try { await adminService.modifierSecteur(editionSecteur.id, { nom: editionSecteur.nom.trim() }); setEditionSecteur(null); toast.success('Secteur renommé'); await charger(); }
    catch (e) { toast.error(msg(e)); }
  };
  const renommerMetier = async () => {
    if (!editionMetier || !editionMetier.nom.trim()) return;
    try { await adminService.modifierMetier(editionMetier.id, { nom: editionMetier.nom.trim() }); setEditionMetier(null); toast.success('Métier renommé'); await charger(); }
    catch (e) { toast.error(msg(e)); }
  };

  if (chargement) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;
  if (erreur) return <p className="text-destructive">{erreur}</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Ce référentiel remplace progressivement les champs libres « profession » et « secteur d'activité » saisis sur les fiches client et prospect.</p>
      {peutConfigurer && (
        <div className="flex gap-2 max-w-md">
          <Input placeholder="Nouveau secteur (ex. Commerce de vivres)" value={nouveauSecteur} onChange={(e) => setNouveauSecteur(e.target.value)} />
          <Button variant="brand" disabled={!nouveauSecteur.trim()} onClick={creerSecteur}><Plus className="h-4 w-4 mr-1.5" />Ajouter</Button>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {secteurs.length === 0 && <p className="text-sm text-muted-foreground">Aucun secteur défini.</p>}
        {secteurs.map((s) => (
          <Card key={s.id}>
            <CardHeader className="pb-2">
              {editionSecteur?.id === s.id ? (
                <div className="flex items-center gap-1">
                  <Input className="h-8 text-sm" value={editionSecteur.nom} onChange={(e) => setEditionSecteur({ id: s.id, nom: e.target.value })} autoFocus />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={renommerSecteur}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditionSecteur(null)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{s.nom}</CardTitle>
                  {peutConfigurer && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditionSecteur({ id: s.id, nom: s.nom })}><Pencil className="h-3 w-3" /></Button>}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {s.metiers.length === 0 && <p className="text-xs text-muted-foreground">Aucun métier.</p>}
                {s.metiers.map((m) => (
                  editionMetier?.id === m.id ? (
                    <span key={m.id} className="inline-flex items-center gap-1">
                      <Input className="h-7 text-xs w-32" value={editionMetier.nom} onChange={(e) => setEditionMetier({ id: m.id, nom: e.target.value })} autoFocus />
                      <button onClick={renommerMetier}><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEditionMetier(null)}><X className="h-3.5 w-3.5" /></button>
                    </span>
                  ) : (
                    <Badge key={m.id} variant="outline" className={peutConfigurer ? 'cursor-pointer' : ''} onClick={() => peutConfigurer && setEditionMetier({ id: m.id, nom: m.nom })} title={peutConfigurer ? 'Cliquer pour renommer' : undefined}>{m.nom}</Badge>
                  )
                ))}
              </div>
              {peutConfigurer && (
                <div className="flex gap-2">
                  <Input className="h-8 text-xs" placeholder="Nouveau métier" value={nouveauMetier[s.id] ?? ''} onChange={(e) => setNouveauMetier({ ...nouveauMetier, [s.id]: e.target.value })} />
                  <Button size="sm" variant="outline" onClick={() => creerMetier(s.id)}>Ajouter</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
