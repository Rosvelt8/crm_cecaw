'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { agentService } from '@/services/agentService';
import { objectifService } from '@/services/objectifService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Clock, Wifi, WifiOff, Target, Users, TrendingUp, Mail, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';

function isOnline(ts: string | null) {
  return ts ? Date.now() - new Date(ts).getTime() < 60 * 60 * 1000 : false;
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

const STATUT_OBJECTIF: Record<string, { label: string; color: string }> = {
  en_cours: { label: 'En cours',  color: 'bg-blue-100 text-blue-700' },
  atteint:  { label: 'Atteint',   color: 'bg-emerald-100 text-emerald-700' },
  depasse:  { label: 'Dépassé',   color: 'bg-violet-100 text-violet-700' },
  echec:    { label: 'Échec',     color: 'bg-red-100 text-red-700' },
};

export default function AgentDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<any | null>(null);
  const [objectifs, setObjectifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      agentService.getAgent(id),
      objectifService.getAllObjectifs({ agent_id: id }),
    ]).then(([a, objRows]) => {
      setAgent(a);
      setObjectifs(objRows);
    }).catch(() => {
      router.back();
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-32 text-center text-muted-foreground text-sm">Chargement…</div>;

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-muted-foreground">Agent introuvable.</p>
        <button className="text-sm underline text-brand-600" onClick={() => router.back()}>Retour</button>
      </div>
    );
  }

  const u = agent.utilisateur ?? {};
  const online = isOnline(agent.dernierePositionAt ?? null);
  const periodeLabel = (p: string) =>
    p === 'semaine' ? 'Hebdomadaire' : p === 'mois' ? 'Mensuel' : 'Trimestriel';

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{u.prenom} {u.nom}</h1>
          <p className="text-sm text-muted-foreground">{agent.matricule} — Fiche agent terrain</p>
        </div>
      </div>

      {/* Fiche agent */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-xl shrink-0">
            {(u.prenom ?? '?')[0]}{(u.nom ?? '?')[0]}
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-x-6 sm:gap-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Matricule</p>
              <p className="font-mono font-bold mt-0.5">{agent.matricule}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Équipe</p>
              <p className="font-semibold mt-0.5">{u.equipe?.nom ?? '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Agence</p>
              <p className="font-semibold mt-0.5">{u.agence?.nom ?? '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Secteur</p>
              <p className="font-semibold mt-0.5 flex items-center gap-1">
                {agent.secteur
                  ? <><MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{agent.secteur}</>
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</p>
              <p className="mt-0.5 text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3.5 w-3.5 shrink-0" />{u.email ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rôle</p>
              <p className="mt-0.5 text-sm flex items-center gap-1 text-muted-foreground">
                <UserCog className="h-3.5 w-3.5 shrink-0" />
                {typeof u.role === 'string'
                  ? u.role === 'manager' ? 'Manager' : 'Agent'
                  : (u.role?.slug === 'manager' ? 'Manager' : 'Agent')}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statut GPS</p>
              <div className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold mt-0.5', online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {online ? 'En ligne' : 'Hors ligne'}
              </div>
            </div>
            {agent.dernierePositionAt && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dernière position</p>
                <p className="mt-0.5 text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {new Date(agent.dernierePositionAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Objectifs */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-bold">Objectifs assignés</h2>
          <span className="text-xs bg-brand-100 text-brand-700 font-bold px-2.5 py-0.5 rounded-full">
            {objectifs.length}
          </span>
        </div>

        {objectifs.length === 0 ? (
          <Card className="py-16 text-center text-muted-foreground text-sm">
            Aucun objectif assigné à cet agent pour le moment.
          </Card>
        ) : (
          <div className="grid gap-4">
            {objectifs.map((obj: any) => {
              const valActuelle = obj.valeur_actuelle ?? obj.valeurActuelle ?? obj.realise ?? 0;
              const valCible    = obj.valeur_cible   ?? obj.valeurCible   ?? obj.cible    ?? 1;
              const unite       = obj.unite ?? 'clients';
              const pct = Math.min(100, Math.round((valActuelle / valCible) * 100));
              const statut = obj.statut ?? 'en_cours';
              const statutCfg = STATUT_OBJECTIF[statut] ?? STATUT_OBJECTIF.en_cours;
              const isTeam = obj.assignationType === 'equipe' || obj.type === 'equipe';
              const produitNom = obj.produit?.nom ?? '—';
              const equipeNom = obj.equipe?.nom ?? '—';
              const barColor =
                pct >= 100 ? 'bg-emerald-500' :
                pct >= 75  ? 'bg-brand-500' :
                pct >= 40  ? 'bg-amber-400' : 'bg-red-400';

              const realiseLabel = unite === 'clients'
                ? `${valActuelle} client${valActuelle > 1 ? 's' : ''}`
                : fmt(valActuelle);
              const cibleLabel = unite === 'clients'
                ? `${valCible} client${valCible > 1 ? 's' : ''}`
                : fmt(valCible);

              return (
                <Card key={obj.id} className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <h3 className="font-bold text-base">{obj.titre ?? obj.nom ?? '—'}</h3>
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', statutCfg.color)}>
                          {statutCfg.label}
                        </span>
                        {isTeam && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-700">
                            <Users className="h-2.5 w-2.5" />{equipeNom}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {produitNom} · {periodeLabel(obj.periodicite ?? 'mois')} · {obj.dateDebut ?? obj.date_debut} → {obj.dateFin ?? obj.date_fin}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-black leading-none">{pct}%</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">complété</p>
                    </div>
                  </div>

                  <div className="h-3 rounded-full bg-muted mb-3 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', barColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Réalisé : <strong className="text-foreground">{realiseLabel}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Cible : <strong className="text-foreground">{cibleLabel}</strong>
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
