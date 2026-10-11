'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi, Onglets } from '@/components/ui/kpi';
import { communicationApi, calendrierApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDate, formatDateTime } from '@/lib/utils';

type Onglet = 'declencheurs' | 'sms' | 'calendrier' | 'campagnes';
const DEST: Record<string, string> = { acteur: "L'auteur de l'action", roles: 'Des rôles', client: 'Le client (SMS)' };
const libelleDest = (d: string) => DEST[d] ?? (d.startsWith('utilisateur:') ? `Utilisateur « ${d.slice(12)} »` : d);

export default function CommunicationPage() {
  const [onglet, setOnglet] = useState<Onglet>('declencheurs');
  return (
    <div className="space-y-4">
      <EnTete titre="Communication" sousTitre="Règles de notification par événement, file d'envoi des SMS, calendrier et campagnes" />
      <Onglets valeur={onglet} onChange={setOnglet} options={[{ id: 'declencheurs', label: 'Déclencheurs' }, { id: 'sms', label: 'SMS' }, { id: 'calendrier', label: 'Calendrier' }, { id: 'campagnes', label: 'Campagnes' }]} />
      {onglet === 'declencheurs' ? <Declencheurs /> : onglet === 'sms' ? <Sms /> : onglet === 'calendrier' ? <Calendrier /> : <Campagnes />}
    </div>
  );
}

function Declencheurs() {
  const { can } = useCan();
  const modif = can('communication:CONFIGURE');
  const [items, setItems] = useState<any[]>([]);
  const [edition, setEdition] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(async () => { try { setItems(await communicationApi.declencheurs()); setErreur(null); } catch (e) { setErreur(msg(e, 'Accès refusé')); } }, []);
  useEffect(() => { void charger(); }, [charger]);
  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Variables disponibles dans les gabarits : {'{{reference}}'}, {'{{client}}'}, {'{{montant}}'}, {'{{jours}}'}, {'{{date}}'}… selon l'événement.</p>
      {items.map((d) => (
        <Card key={d.id}><CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{d.libelle}</p><p className="text-xs text-muted-foreground">{d.evenement} → {libelleDest(d.destinataire)}{d.roleCodes ? ` (${d.roleCodes.join(', ')})` : ''} · {d.canaux.join(', ')}</p></div>
            <div className="flex items-center gap-2"><Badge variant={d.actif ? 'success' : 'outline'}>{d.actif ? 'Actif' : 'Désactivé'}</Badge>{modif && <><Button size="sm" variant="ghost" onClick={() => setEdition(edition?.id === d.id ? null : { ...d })}>Modifier</Button><Button size="sm" variant="outline" onClick={async () => { try { await communicationApi.modifierDeclencheur(d.id, { actif: !d.actif }); await charger(); } catch (e) { toast.error(msg(e)); } }}>{d.actif ? 'Désactiver' : 'Activer'}</Button></>}</div></div>
          {edition?.id === d.id ? (
            <div className="space-y-2"><Input value={edition.titre} onChange={(e) => setEdition({ ...edition, titre: e.target.value })} /><Textarea rows={3} value={edition.gabarit} onChange={(e) => setEdition({ ...edition, gabarit: e.target.value })} />
              <div className="flex gap-3 text-sm">{['in_app', 'sms', 'whatsapp', 'email'].map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={edition.canaux.includes(c)} onChange={() => setEdition({ ...edition, canaux: edition.canaux.includes(c) ? edition.canaux.filter((x: string) => x !== c) : [...edition.canaux, c] })} />{c}</label>)}</div>
              <Button size="sm" variant="brand" disabled={edition.canaux.length === 0} onClick={async () => { try { await communicationApi.modifierDeclencheur(d.id, { titre: edition.titre, gabarit: edition.gabarit, canaux: edition.canaux }); toast.success('Déclencheur modifié'); setEdition(null); await charger(); } catch (e) { toast.error(msg(e)); } }}>Enregistrer</Button></div>
          ) : <p className="text-xs rounded bg-muted p-2">{d.gabarit}</p>}
        </CardContent></Card>
      ))}
    </div>
  );
}

function Sms() {
  const { can } = useCan();
  const modif = can('communication:CONFIGURE');
  const [d, setD] = useState<any>(null);
  const [statut, setStatut] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const charger = useCallback(async () => { try { setD(await communicationApi.sms(statut || undefined)); setErreur(null); } catch (e) { setErreur(msg(e, 'Accès refusé')); } }, [statut]);
  useEffect(() => { void charger(); }, [charger]);
  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  if (!d) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return (
    <div className="space-y-3">
      {!d.passerelle_configuree && <p className="rounded-md border border-warning/40 bg-warning-50 p-3 text-sm text-warning-700">Aucune passerelle SMS n'est configurée (variable SMS_API_URL) : les messages restent en échec. Voir DEPLOIEMENT.md.</p>}
      <Card><CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Canal WhatsApp</p>
          <p className="text-xs text-muted-foreground">
            {!d.whatsapp?.configure ? "Identifiants non renseignés côté serveur (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID) : le canal reste indisponible." : d.whatsapp.actif ? 'Actif : les messages WhatsApp sont mis en file et envoyés.' : 'Configuré mais désactivé.'}
          </p>
        </div>
        {modif && d.whatsapp?.configure && (
          <Button size="sm" variant={d.whatsapp.actif ? 'outline' : 'brand'} onClick={async () => { try { await communicationApi.basculerWhatsapp(!d.whatsapp.actif); toast.success(d.whatsapp.actif ? 'WhatsApp désactivé' : 'WhatsApp activé'); await charger(); } catch (e) { toast.error(msg(e)); } }}>
            {d.whatsapp.actif ? 'Désactiver' : 'Activer'}
          </Button>
        )}
      </CardContent></Card>
      <div className="grid grid-cols-3 gap-3"><Kpi label="En attente" valeur={d.resume.en_attente ?? 0} /><Kpi label="Envoyés" valeur={d.resume.envoye ?? 0} ton="bon" /><Kpi label="En échec" valeur={d.resume.echec ?? 0} ton={d.resume.echec ? 'mauvais' : undefined} /></div>
      <div className="flex gap-2"><select className="h-10 rounded-lg border bg-background px-3 text-sm" value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Tous</option><option value="en_attente">En attente</option><option value="envoye">Envoyés</option><option value="echec">En échec</option></select>
        {modif && <Button variant="outline" onClick={async () => { try { const r = await communicationApi.traiterSms(); toast.success(`${r.envoyes} envoyé(s), ${r.echecs} échec(s)`); await charger(); } catch (e) { toast.error(msg(e)); } }}><Send className="h-4 w-4 mr-1.5" />Traiter la file</Button>}</div>
      <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Numéro</th><th className="px-3 py-2 text-left">Message</th><th className="px-3 py-2 text-left">Statut</th><th /></tr></thead>
        <tbody>{d.items.map((m: any) => (<tr key={m.id} className="border-t"><td className="px-3 py-1.5 whitespace-nowrap">{formatDateTime(m.createdAt)}</td><td className="px-3 py-1.5">{m.telephone}</td><td className="px-3 py-1.5 max-w-md truncate" title={m.message}>{m.message}</td>
          <td className="px-3 py-1.5"><Badge variant={m.statut === 'envoye' ? 'success' : m.statut === 'echec' ? 'destructive' : 'warning'}>{m.statut.replace('_', ' ')}</Badge>{m.erreur && <p className="text-xs text-destructive">{m.erreur}</p>}</td>
          <td className="px-3 py-1.5 text-right">{modif && m.statut === 'echec' && <Button size="sm" variant="ghost" onClick={async () => { try { await communicationApi.renvoyerSms(m.id); await charger(); } catch (e) { toast.error(msg(e)); } }}>Renvoyer</Button>}</td></tr>))}</tbody></table></CardContent></Card>
    </div>
  );
}

const TYPE_EVENEMENT: Record<string, string> = { ferie_nationale: 'Fête nationale', ferie_religieuse: 'Fête religieuse', scolaire: 'Scolaire', commercial: 'Commercial' };

/** Calendrier camerounais (compléments stratégiques, point 6). */
function Calendrier() {
  const { can } = useCan();
  const modif = can('communication:CONFIGURE');
  const [items, setItems] = useState<any[]>([]);
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  const [erreur, setErreur] = useState<string | null>(null);
  const [f, setF] = useState({ nom: '', type: 'commercial', date_debut: '', date_fin: '' });

  const charger = useCallback(async () => {
    try { setItems(await calendrierApi.lister({ annee: Number(annee) })); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Accès refusé')); }
  }, [annee]);
  useEffect(() => { void charger(); }, [charger]);

  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={annee} onChange={(e) => setAnnee(e.target.value)}>
          {[2025, 2026, 2027].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Les dates des fêtes musulmanes (Aïd el-Fitr, Tabaski) sont des estimations soumises à confirmation officielle : à corriger ici si besoin.</p>
      </div>
      {modif && (
        <Card><CardContent className="p-3 grid sm:grid-cols-4 gap-2 items-end">
          <Input placeholder="Nom de l'événement" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
          <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {Object.entries(TYPE_EVENEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Input type="date" value={f.date_debut} onChange={(e) => setF({ ...f, date_debut: e.target.value })} />
          <Button variant="brand" disabled={!f.nom.trim() || !f.date_debut} onClick={async () => { try { await calendrierApi.creer(f); toast.success('Événement créé'); setF({ nom: '', type: 'commercial', date_debut: '', date_fin: '' }); await charger(); } catch (e) { toast.error(msg(e)); } }}>Ajouter</Button>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Événement</th><th className="px-3 py-2 text-left">Type</th><th /></tr></thead>
        <tbody>{items.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Aucun événement pour {annee}</td></tr>}
          {items.map((e: any) => (
            <tr key={e.id} className="border-t">
              <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(e.dateDebut)}{e.dateFin ? ` au ${formatDate(e.dateFin)}` : ''}</td>
              <td className="px-3 py-1.5">{e.nom}</td>
              <td className="px-3 py-1.5"><Badge variant="outline">{TYPE_EVENEMENT[e.type] ?? e.type}</Badge></td>
              <td className="px-3 py-1.5 text-right">{modif && <button className="text-muted-foreground hover:text-destructive" onClick={async () => { if (window.confirm(`Supprimer « ${e.nom} » ?`)) { try { await calendrierApi.supprimer(e.id); await charger(); } catch (err) { toast.error(msg(err)); } } }}>Supprimer</button>}</td>
            </tr>
          ))}
        </tbody>
      </table></CardContent></Card>
    </div>
  );
}

/** Les campagnes ont désormais leur propre module (Marketing & CRM › Campagnes). */
function Campagnes() {
  return (
    <Card><CardContent className="p-6 text-center space-y-3">
      <p className="text-sm text-muted-foreground">Les campagnes se gèrent maintenant dans le module Marketing : fiche complète, équipe, personnes ciblées, objectifs et évaluation.</p>
      <Link href="/dashboard/marketing/campagnes"><Button variant="brand" size="sm">Ouvrir les campagnes</Button></Link>
    </CardContent></Card>
  );
}
