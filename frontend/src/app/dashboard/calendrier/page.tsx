'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, List, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EnTete } from '@/components/ui/kpi';
import { agendaApi, type ElementAgenda } from '@/services/metierService';
import { msg } from '@/lib/apiHelpers';
import { cn } from '@/lib/utils';

/**
 * Calendrier des opérations : une seule vue des dates portées par les modules (campagnes,
 * objectifs, tournées, crédit, recouvrement, collecte, relances CRM, KYC, calendrier camerounais).
 * Les sources proposées sont celles que l'utilisateur a le droit de consulter.
 */

const SOURCES: Record<string, { label: string; couleur: string }> = {
  evenement: { label: 'Jours fériés & événements', couleur: '#64748b' },
  campagne: { label: 'Campagnes', couleur: '#b8860b' },
  objectif: { label: 'Objectifs', couleur: '#7c3aed' },
  tournee: { label: 'Tournées', couleur: '#0d9488' },
  echeance: { label: 'Échéances crédit', couleur: '#2563eb' },
  decaissement: { label: 'Décaissements', couleur: '#16a34a' },
  promesse: { label: 'Promesses de paiement', couleur: '#ea580c' },
  recouvrement: { label: 'Actions recouvrement', couleur: '#dc2626' },
  collecte: { label: 'Journées de collecte', couleur: '#059669' },
  relance: { label: 'Relances commerciales', couleur: '#db2777' },
  kyc: { label: 'Pièces KYC expirées', couleur: '#9333ea' },
};
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const STOCKAGE = 'cecaw.calendrier-operations.sources';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ajouterJours = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** Grille du mois : du lundi précédant le 1er au dimanche suivant le dernier jour. */
const grille = (mois: Date) => {
  const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
  const debut = ajouterJours(premier, -((premier.getDay() + 6) % 7));
  const dernier = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);
  const fin = ajouterJours(dernier, 6 - ((dernier.getDay() + 6) % 7));
  const jours: Date[] = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) jours.push(d);
  return jours;
};
/** Un élément couvre un jour s'il commence ce jour-là ou s'étend jusqu'à lui. */
const couvre = (e: ElementAgenda, jour: string) => e.debut === jour || (!!e.fin && e.debut <= jour && e.fin >= jour);

export default function CalendrierOperationsPage() {
  const [mois, setMois] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [vue, setVue] = useState<'mois' | 'liste'>('mois');
  const [disponibles, setDisponibles] = useState<string[]>([]);
  const [actives, setActives] = useState<string[] | null>(null);
  const [resultat, setResultat] = useState<{ cle: string; elements: ElementAgenda[] }>({ cle: '', elements: [] });
  const [jourChoisi, setJourChoisi] = useState<string | null>(null);
  const jours = useMemo(() => grille(mois), [mois]);
  const aujourdhui = iso(new Date());

  useEffect(() => {
    agendaApi.sources().then((s) => {
      setDisponibles(s);
      let memo: string[] | null = null;
      try { memo = JSON.parse(localStorage.getItem(STOCKAGE) ?? 'null'); } catch { memo = null; }
      setActives(memo ? memo.filter((x) => s.includes(x)) : s);
    }).catch((e) => toast.error(msg(e)));
  }, []);
  useEffect(() => { if (actives) { try { localStorage.setItem(STOCKAGE, JSON.stringify(actives)); } catch { /* non mémorisé */ } } }, [actives]);

  // Clé de la requête courante : tant que le résultat affiché ne lui correspond pas, on charge.
  const cle = actives ? `${iso(jours[0])}|${iso(jours[jours.length - 1])}|${actives.join(',')}` : '';
  const chargement = !actives || resultat.cle !== cle;
  const elements = resultat.elements;
  useEffect(() => {
    if (!actives) return;
    const requete = actives.length === 0 ? Promise.resolve([] as ElementAgenda[]) : agendaApi.lister(iso(jours[0]), iso(jours[jours.length - 1]), actives);
    requete.then((r) => setResultat({ cle, elements: r })).catch((e) => { toast.error(msg(e, 'Calendrier indisponible')); setResultat({ cle, elements: [] }); });
  }, [jours, actives, cle]);

  const parJour = useMemo(() => {
    const m = new Map<string, ElementAgenda[]>();
    for (const d of jours) { const k = iso(d); m.set(k, elements.filter((e) => couvre(e, k))); }
    return m;
  }, [jours, elements]);

  const basculer = (s: string) => setActives((a) => (a ?? []).includes(s) ? (a ?? []).filter((x) => x !== s) : [...(a ?? []), s]);
  const libelleMois = mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const duMois = elements.filter((e) => { const m = iso(mois).slice(0, 7); return e.debut.slice(0, 7) === m || (!!e.fin && e.debut.slice(0, 7) <= m && e.fin.slice(0, 7) >= m); });
  const listeJour = jourChoisi ? parJour.get(jourChoisi) ?? [] : [];

  return (
    <div className="space-y-4">
      <EnTete titre="Calendrier des opérations" sousTitre="Campagnes, objectifs, tournées, crédit, recouvrement, collecte, relances et événements, dans votre périmètre">
        <div className="flex rounded-lg border p-0.5">
          <button className={cn('px-2.5 py-1 rounded-md text-sm flex items-center gap-1', vue === 'mois' && 'bg-muted font-medium')} onClick={() => setVue('mois')}><CalendarDays className="h-4 w-4" />Mois</button>
          <button className={cn('px-2.5 py-1 rounded-md text-sm flex items-center gap-1', vue === 'liste' && 'bg-muted font-medium')} onClick={() => setVue('liste')}><List className="h-4 w-4" />Liste</button>
        </div>
      </EnTete>

      <div className="flex flex-wrap gap-1.5">
        {disponibles.map((s) => {
          const on = actives?.includes(s);
          return (
            <button key={s} onClick={() => basculer(s)} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors', on ? 'bg-background' : 'opacity-45 bg-muted/40')}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCES[s]?.couleur }} />{SOURCES[s]?.label ?? s}
            </button>
          );
        })}
        {disponibles.length > 1 && <button className="text-xs text-muted-foreground underline ml-1" onClick={() => setActives(actives?.length === disponibles.length ? [] : disponibles)}>{actives?.length === disponibles.length ? 'Tout masquer' : 'Tout afficher'}</button>}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => { const d = new Date(); setMois(new Date(d.getFullYear(), d.getMonth(), 1)); setJourChoisi(iso(d)); }}>Aujourd&apos;hui</Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        <h2 className="text-lg font-semibold capitalize ml-1">{libelleMois}</h2>
        {chargement && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <span className="ml-auto text-xs text-muted-foreground">{duMois.length} opération(s) ce mois</span>
      </div>

      {vue === 'mois' ? (
        <div className="grid lg:grid-cols-[1fr_320px] gap-4">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">{JOURS.map((j) => <div key={j} className="px-2 py-1.5">{j}</div>)}</div>
            <div className="grid grid-cols-7">
              {jours.map((d) => {
                const k = iso(d); const liste = parJour.get(k) ?? []; const horsMois = d.getMonth() !== mois.getMonth();
                return (
                  <button key={k} onClick={() => setJourChoisi(k)} className={cn('min-h-[92px] sm:min-h-[110px] border-b border-r p-1 text-left align-top transition-colors hover:bg-muted/40', horsMois && 'bg-muted/20 text-muted-foreground', jourChoisi === k && 'ring-2 ring-inset ring-brand-500')}>
                    <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs', k === aujourdhui && 'bg-brand-600 text-white font-bold')}>{d.getDate()}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {liste.slice(0, 3).map((e) => (
                        <div key={e.id} className="truncate rounded px-1 py-px text-[10.5px] leading-tight text-white" style={{ background: SOURCES[e.source]?.couleur ?? '#64748b' }} title={`${e.titre}${e.details ? ` — ${e.details}` : ''}`}>{e.titre}</div>
                      ))}
                      {liste.length > 3 && <div className="text-[10.5px] text-muted-foreground px-1">+{liste.length - 3} autre(s)</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card className="h-fit lg:sticky lg:top-20">
            <CardContent className="p-3 space-y-2">
              {!jourChoisi ? <p className="text-sm text-muted-foreground py-6 text-center">Sélectionnez un jour pour voir le détail.</p> : (
                <>
                  <div className="flex items-center justify-between"><p className="font-semibold capitalize">{new Date(`${jourChoisi}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p><button onClick={() => setJourChoisi(null)} className="text-muted-foreground"><X className="h-4 w-4" /></button></div>
                  {listeJour.length === 0 ? <p className="text-sm text-muted-foreground py-4">Aucune opération.</p> : <ListeElements elements={listeJour} />}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card><CardContent className="p-3 space-y-4">
          {duMois.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Aucune opération ce mois-ci.</p> :
            [...new Set(duMois.map((e) => (e.debut < iso(mois) ? iso(mois) : e.debut)))].sort().map((j) => (
              <div key={j}>
                <p className={cn('text-xs font-semibold uppercase mb-1.5 capitalize', j === aujourdhui ? 'text-brand-700' : 'text-muted-foreground')}>{new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <ListeElements elements={duMois.filter((e) => (e.debut < iso(mois) ? iso(mois) : e.debut) === j)} />
              </div>
            ))}
        </CardContent></Card>
      )}
    </div>
  );
}

function ListeElements({ elements }: { elements: ElementAgenda[] }) {
  return (
    <div className="space-y-1.5">
      {elements.map((e) => {
        const contenu = (
          <div className="flex gap-2 rounded-md border p-2 hover:bg-muted/40 transition-colors">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SOURCES[e.source]?.couleur }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">{e.titre}</p>
              {e.details && <p className="text-xs text-muted-foreground">{e.details}</p>}
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-[11px] text-muted-foreground">{SOURCES[e.source]?.label}</span>
                {e.fin && e.fin !== e.debut && <span className="text-[11px] text-muted-foreground">· {new Date(`${e.debut}T12:00:00`).toLocaleDateString('fr-FR')} → {new Date(`${e.fin}T12:00:00`).toLocaleDateString('fr-FR')}</span>}
                {e.statut && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{e.statut.replace(/_/g, ' ')}</Badge>}
              </div>
            </div>
          </div>
        );
        return e.lien ? <Link key={e.id} href={e.lien}>{contenu}</Link> : <div key={e.id}>{contenu}</div>;
      })}
    </div>
  );
}
