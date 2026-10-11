'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, CalendarRange, Loader2, Megaphone, Plus, Target, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi, fcfa } from '@/components/ui/kpi';
import { campagnesApi } from '@/services/metierService';
import { agenceService } from '@/services/agenceService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDate } from '@/lib/utils';
import { CANAL_CAMPAGNE, STATUT_CAMPAGNE, TYPE_CAMPAGNE } from '@/lib/campagneLabels';

const champ = 'h-10 rounded-lg border bg-background px-3 text-sm';

/** Avancement dans le temps (%) d'une campagne datée. */
const avancement = (debut: string, fin?: string | null) => {
  if (!fin) return null;
  const d = new Date(debut).getTime(); const f = new Date(fin).getTime() + 86_400_000;
  return Math.min(100, Math.max(0, Math.round(((Date.now() - d) / (f - d)) * 100)));
};

export default function CampagnesPage() {
  const { can } = useCan();
  const [items, setItems] = useState<any[]>([]);
  const [agences, setAgences] = useState<{ id: number; nom: string }[]>([]);
  const [filtres, setFiltres] = useState({ statut: '', type: '', agence_id: '', search: '' });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (f: typeof filtres) => {
    try { setItems(await campagnesApi.lister(f.statut || undefined, { type: f.type || undefined, agence_id: f.agence_id || undefined, search: f.search || undefined })); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Chargement impossible')); } finally { setChargement(false); }
  }, []);

  useEffect(() => { agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => { void charger(filtres); }, 250); return () => clearTimeout(t); }, [filtres, charger]);

  const resume = useMemo(() => ({
    enCours: items.filter((c) => c.statut === 'en_cours').length,
    brouillons: items.filter((c) => c.statut === 'brouillon').length,
    budget: items.reduce((s, c) => s + Number(c.budget ?? 0), 0),
    prospects: items.reduce((s, c) => s + (c._count?.prospectsOrigine ?? 0), 0),
  }), [items]);

  return (
    <div className="space-y-4">
      <EnTete titre="Campagnes marketing" sousTitre="Opérations commerciales : dates, équipe, personnes ciblées, objectifs et résultats">
        <Link href="/dashboard/calendrier"><Button variant="outline"><CalendarRange className="h-4 w-4 mr-1.5" />Calendrier</Button></Link>
        <Link href="/dashboard/marketing/campagnes/evaluation"><Button variant="outline"><BarChart3 className="h-4 w-4 mr-1.5" />Évaluation</Button></Link>
        {can('communication:CONFIGURE') && <Link href="/dashboard/marketing/campagnes/nouveau"><Button variant="brand"><Plus className="h-4 w-4 mr-1.5" />Nouvelle campagne</Button></Link>}
      </EnTete>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Campagnes en cours" valeur={resume.enCours} />
        <Kpi label="Brouillons" valeur={resume.brouillons} />
        <Kpi label="Budget engagé" valeur={fcfa(resume.budget)} />
        <Kpi label="Prospects attribués" valeur={resume.prospects} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="w-56" placeholder="Rechercher une campagne…" value={filtres.search} onChange={(e) => setFiltres({ ...filtres, search: e.target.value })} />
        <select className={champ} value={filtres.statut} onChange={(e) => setFiltres({ ...filtres, statut: e.target.value })}><option value="">Tous les statuts</option>{Object.entries(STATUT_CAMPAGNE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select className={champ} value={filtres.type} onChange={(e) => setFiltres({ ...filtres, type: e.target.value })}><option value="">Tous les types</option>{Object.entries(TYPE_CAMPAGNE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className={champ} value={filtres.agence_id} onChange={(e) => setFiltres({ ...filtres, agence_id: e.target.value })}><option value="">Toutes les agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
      </div>

      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : chargement ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center space-y-2"><Megaphone className="h-8 w-8 mx-auto text-muted-foreground" /><p className="text-sm text-muted-foreground">Aucune campagne ne correspond.</p></CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((c) => {
            const st = STATUT_CAMPAGNE[c.statut] ?? { label: c.statut, variant: 'outline' as const };
            const av = c.statut === 'en_cours' ? avancement(c.dateDebut, c.dateFin) : null;
            return (
              <Link key={c.id} href={`/dashboard/marketing/campagnes/${c.id}`}>
                <Card className="h-full hover:border-brand-400 hover:shadow-md transition-all">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{c.nom}</p>
                        <p className="text-xs text-muted-foreground">{TYPE_CAMPAGNE[c.type] ?? c.type}{c.canal ? ` · ${CANAL_CAMPAGNE[c.canal]}` : ''}{c.agence ? ` · ${c.agence.nom}` : ''}</p>
                      </div>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                    {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                    <p className="text-xs">{formatDate(c.dateDebut)}{c.dateFin ? ` → ${formatDate(c.dateFin)}` : ' · sans date de fin'}</p>
                    {av !== null && <div className="h-1.5 rounded-full bg-muted overflow-hidden" title={`${av} % de la période écoulée`}><div className="h-full bg-brand-600" style={{ width: `${av}%` }} /></div>}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c._count?.cibles ?? 0} cible(s)</span>
                      <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{c._count?.objectifs ?? 0} objectif(s)</span>
                      <span>{c._count?.membres ?? 0} membre(s)</span>
                      {c.budget != null && <span>{fcfa(c.budget)}</span>}
                    </div>
                    {c.responsable && <p className="text-xs">Responsable : <span className="font-medium">{c.responsable.prenom} {c.responsable.nom}</span></p>}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
