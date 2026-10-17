'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { EnTete, fcfa } from '@/components/ui/kpi';
import Carte, { type CartePoint, type CartePolygone, type IconeCarte } from '@/components/map/Carte';
import { sigApi } from '@/services/metierService';
import { agenceService } from '@/services/agenceService';
import { msg } from '@/lib/apiHelpers';

interface DefCouche { id: string; label: string; couleur: string; defaut: boolean }
const COUCHES: DefCouche[] = [
  { id: 'agences', label: 'Agences', couleur: '#111827', defaut: true },
  { id: 'points_collecte', label: 'Points de collecte', couleur: '#0ea5e9', defaut: false },
  { id: 'clients', label: 'Clients', couleur: '#10b981', defaut: true },
  { id: 'domiciles', label: 'Domiciles clients', couleur: '#22c55e', defaut: false },
  { id: 'activites', label: 'Activités professionnelles', couleur: '#8b5cf6', defaut: false },
  { id: 'prospects', label: 'Prospects', couleur: '#f59e0b', defaut: false },
  { id: 'credits', label: 'Crédits en cours', couleur: '#3b82f6', defaut: false },
  { id: 'impayes', label: 'Impayés', couleur: '#ef4444', defaut: false },
  { id: 'agents', label: 'Agents en activité', couleur: '#ec4899', defaut: true },
  { id: 'zones', label: 'Zones', couleur: '#6366f1', defaut: true },
];

/** Pictogramme de chaque couche, repris dans la légende et sur la carte. */
const ICONE_COUCHE: Record<string, IconeCarte> = { agences: 'agence', points_collecte: 'collecte', clients: 'client', domiciles: 'domicile', activites: 'activite', prospects: 'prospect', credits: 'credit', impayes: 'impaye', agents: 'agent' };

export default function SigPage() {
  const [actives, setActives] = useState<string[]>(COUCHES.filter((c) => c.defaut).map((c) => c.id));
  const [agences, setAgences] = useState<any[]>([]);
  const [agenceId, setAgenceId] = useState('');
  const [donnees, setDonnees] = useState<Record<string, any>>({});
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => { agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {}); }, []);

  const charger = useCallback(async () => {
    if (actives.length === 0) { setDonnees({}); return; }
    setChargement(true);
    try { setDonnees(await sigApi.couches(actives, agenceId ? Number(agenceId) : undefined)); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Chargement impossible')); }
    finally { setChargement(false); }
  }, [actives, agenceId]);
  useEffect(() => { const t = setTimeout(charger, 200); return () => clearTimeout(t); }, [charger]);

  const { points, polygones, tronque } = useMemo(() => {
    const pts: CartePoint[] = [];
    const pgs: CartePolygone[] = [];
    let tr = false;
    const tel = (t?: string) => (t ? [{ label: 'Appeler', href: `tel:${t.replace(/\s+/g, '')}`, icone: 'appeler' as const }] : []);
    const route = (lat: number, lng: number) => ({ label: 'Itinéraire', href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, externe: true, icone: 'itineraire' as const });
    const TON_STATUT: Record<string, 'bon' | 'alerte' | 'mauvais' | 'neutre' | 'info'> = { actif: 'bon', inactif: 'neutre', blackliste: 'mauvais', nouveau: 'info', contacte: 'info', interesse: 'bon', negocie: 'alerte' };
    for (const def of COUCHES) {
      const fc = donnees[def.id];
      if (!fc) continue;
      if (fc.tronque) tr = true;
      for (const f of fc.features) {
        const p = f.properties;
        if (def.id === 'zones') {
          const g = f.geometry;
          const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
          for (const poly of polys) pgs.push({
            anneau: poly[0].map(([lng, lat]: number[]) => [lat, lng]), couleur: def.couleur, titre: p.nom,
            popup: { titre: p.nom, sousTitre: p.type === 'secteur' ? 'Secteur' : 'Zone', actions: [{ label: 'Gérer les zones', href: '/dashboard/parametres/zones', icone: 'voir', principale: true }] },
          });
          continue;
        }
        const [lng, lat] = f.geometry.coordinates;
        const enActivite = def.id === 'agents' ? p.en_activite : true;
        const nom = p.nom ?? p.client ?? p.reference ?? def.label;
        let popup: CartePoint['popup'];
        switch (def.id) {
          case 'agences':
            popup = { titre: nom, sousTitre: 'Agence', infos: p.ville ? [{ icone: 'adresse', label: 'Ville', valeur: p.ville }] : [], actions: [{ label: 'Voir les agences', href: '/dashboard/parametres/agences', icone: 'voir', principale: true }, route(lat, lng)] };
            break;
          case 'points_collecte':
            popup = { titre: nom, sousTitre: 'Point de collecte', infos: [...(p.code ? [{ icone: 'document' as const, label: 'Code', valeur: p.code }] : []), ...(p.agence ? [{ icone: 'agence' as const, label: 'Agence', valeur: p.agence }] : [])], actions: [route(lat, lng)] };
            break;
          case 'clients': case 'domiciles':
            popup = {
              titre: nom, sousTitre: def.id === 'clients' ? 'Client' : 'Domicile du client',
              badges: p.statut ? [{ label: p.statut, ton: TON_STATUT[p.statut] ?? 'neutre' }] : [],
              infos: [...(p.telephone ? [{ icone: 'telephone' as const, label: 'Téléphone', valeur: p.telephone }] : []), ...(p.quartier ? [{ icone: 'adresse' as const, label: 'Quartier', valeur: p.quartier }] : [])],
              actions: [{ label: 'Voir le client', href: `/dashboard/marketing/clients/${p.id}`, icone: 'voir', principale: true }, ...tel(p.telephone), route(lat, lng)],
            };
            break;
          case 'activites':
            popup = { titre: nom, sousTitre: 'Lieu d\'activité', infos: p.activite ? [{ icone: 'activite', label: 'Activité', valeur: p.activite }] : [], actions: [{ label: 'Voir le client', href: `/dashboard/marketing/clients/${p.id}`, icone: 'voir', principale: true }, route(lat, lng)] };
            break;
          case 'prospects':
            popup = {
              titre: nom, sousTitre: 'Prospect', badges: p.statut ? [{ label: p.statut, ton: TON_STATUT[p.statut] ?? 'neutre' }] : [],
              infos: p.telephone ? [{ icone: 'telephone', label: 'Téléphone', valeur: p.telephone }] : [],
              actions: [{ label: 'Voir le prospect', href: `/dashboard/marketing/prospects/${p.id}/modifier`, icone: 'voir', principale: true }, ...tel(p.telephone), route(lat, lng)],
            };
            break;
          case 'credits':
            popup = { titre: p.reference ?? 'Crédit', sousTitre: 'Crédit en cours', infos: [{ icone: 'personne', label: 'Client', valeur: p.client }, ...(p.montant ? [{ icone: 'montant' as const, label: 'Montant', valeur: fcfa(p.montant) }] : [])], actions: [{ label: 'Voir le crédit', href: `/dashboard/credits/${p.id}`, icone: 'voir', principale: true }, route(lat, lng)] };
            break;
          case 'impayes':
            popup = {
              titre: p.reference ?? 'Impayé', sousTitre: 'Dossier de recouvrement',
              badges: [...(p.jours ? [{ label: `${p.jours} j de retard`, ton: p.jours > 90 ? 'mauvais' as const : 'alerte' as const }] : []), ...(p.classe ? [{ label: String(p.classe).replace('_', ' '), ton: 'neutre' as const }] : [])],
              infos: [{ icone: 'personne', label: 'Client', valeur: p.client }, ...(p.montant ? [{ icone: 'montant' as const, label: 'Impayé', valeur: fcfa(p.montant) }] : []), ...(p.statut ? [{ icone: 'document' as const, label: 'Statut', valeur: String(p.statut).replace('_', ' ') }] : [])],
              actions: [{ label: 'Voir le dossier', href: `/dashboard/recouvrement/${p.id}`, icone: 'voir', principale: true }, route(lat, lng)],
            };
            break;
          case 'agents':
            popup = {
              titre: nom, sousTitre: `Agent ${p.matricule ?? ''}`.trim(), badges: [{ label: p.en_activite ? 'En activité' : 'Hors activité', ton: p.en_activite ? 'bon' : 'neutre' }],
              infos: [...(p.matricule ? [{ icone: 'document' as const, label: 'Matricule', valeur: p.matricule }] : []), ...(p.type ? [{ icone: 'activite' as const, label: 'Type', valeur: p.type }] : [])],
              actions: [{ label: "Fiche de l'agent", href: `/dashboard/collecte/agents/${p.id}`, icone: 'voir', principale: true }, { label: 'Ses tournées', href: '/dashboard/terrain/tournees', icone: 'tournee' }],
            };
            break;
        }
        pts.push({ lat, lng, couleur: enActivite ? def.couleur : '#94a3b8', icone: ICONE_COUCHE[def.id], pulse: def.id === 'agents' && !!enActivite, titre: nom, popup });
      }
    }
    return { points: pts, polygones: pgs, tronque: tr };
  }, [donnees]);

  return (
    <div className="space-y-4">
      <EnTete titre="Cartographie" sousTitre="Agences, clientèle, crédits, impayés, points de collecte et agents (cliquez un point pour le détail et ses liens)" />
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {COUCHES.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={actives.includes(c.id)} onChange={() => setActives((a) => (a.includes(c.id) ? a.filter((x) => x !== c.id) : [...a, c.id]))} />
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.couleur }} />{c.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <select className="h-9 rounded-lg border bg-background px-3 text-sm" value={agenceId} onChange={(e) => setAgenceId(e.target.value)}><option value="">Toutes les agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
          {chargement && <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="text-xs text-muted-foreground">{points.length} point(s), {polygones.length} zone(s){tronque ? ' · affichage limité à 2 000 éléments par couche' : ''}</span>
        </div>
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      </CardContent></Card>
      <Card><CardContent className="p-2"><Carte points={points} polygones={polygones} hauteur={600} /></CardContent></Card>
      <p className="text-xs text-muted-foreground">Les agences et points de collecte n'apparaissent que si leurs coordonnées sont renseignées (Paramètres › Agences et Zones).</p>
    </div>
  );
}
