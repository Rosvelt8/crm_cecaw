'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { logsService } from '@/services/logsService';
import { agenceService } from '@/services/agenceService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollText, RefreshCw, ShoppingBag, Users, Settings, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const MODULE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  marketing:  { label: 'Marketing',  color: 'bg-brand-100 text-brand-700',     icon: Users },
  collecte:   { label: 'Collecte',   color: 'bg-emerald-100 text-emerald-700', icon: ShoppingBag },
  parametres: { label: 'Paramètres', color: 'bg-slate-100 text-slate-700',     icon: Settings },
  system:     { label: 'Système',    color: 'bg-amber-100 text-amber-700',     icon: Zap },
};

type OpType = 'CREATE' | 'UPDATE' | 'DELETE' | 'other';
function getOpType(action: string): OpType {
  if (!action) return 'other';
  const up = action.toUpperCase();
  if (up.includes('CREATE') || up.includes('CREAT')) return 'CREATE';
  if (up.includes('UPDATE') || up.includes('UPDAT') || up.includes('MODIF')) return 'UPDATE';
  if (up.includes('DELETE') || up.includes('DELET') || up.includes('SUPPR')) return 'DELETE';
  return 'other';
}

const OP_CONFIG: Record<OpType, { label: string; color: string }> = {
  CREATE: { label: 'Création',     color: 'bg-emerald-100 text-emerald-700' },
  UPDATE: { label: 'Modification', color: 'bg-brand-100 text-brand-700' },
  DELETE: { label: 'Suppression',  color: 'bg-red-100 text-red-700' },
  other:  { label: 'Autre',        color: 'bg-slate-100 text-slate-600' },
};

const PER_PAGE = 25;

function formatDate(ts: string) {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function InitialsAvatar({ label }: { label: string }) {
  const parts = label.trim().split(' ');
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : label.slice(0, 2).toUpperCase();
  return (
    <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-[10px] shrink-0">
      {initials}
    </div>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAgence, setFilterAgence] = useState('all');
  const [filterOp, setFilterOp] = useState<OpType | 'all'>('all');
  const [filterModule, setFilterModule] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: PER_PAGE };
      if (filterAgence !== 'all') params.agence_id = filterAgence;
      if (filterModule !== 'all') params.module = filterModule;
      if (filterOp !== 'all') params.action_type = filterOp;
      const [logsRes, agRes] = await Promise.all([
        logsService.getLogs(params),
        agences.length === 0 ? agenceService.getAgences({ per_page: 100 }) : Promise.resolve({ data: agences }),
      ]);
      setLogs(logsRes.data ?? []);
      setTotal(logsRes.meta?.total ?? (logsRes.data ?? []).length);
      if (agences.length === 0) setAgences((agRes as any).data ?? []);
    } catch { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, [page, filterAgence, filterModule, filterOp]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filterAgence, filterModule, filterOp]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Journal d'Activité</h1>
          <p className="text-sm text-muted-foreground">{total} entrée{total !== 1 ? 's' : ''} — traçabilité complète</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')} /> Rafraîchir
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterAgence} onValueChange={setFilterAgence}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Toutes les agences" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les agences</SelectItem>
            {agences.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nom}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterOp} onValueChange={(v) => setFilterOp(v as any)}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Type d'opération" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            {(Object.keys(OP_CONFIG) as OpType[]).map((op) => (
              <SelectItem key={op} value={op}>{OP_CONFIG[op].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Tous les modules" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modules</SelectItem>
            {Object.entries(MODULE_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-24 text-center text-muted-foreground text-sm">Chargement…</div>
      ) : logs.length === 0 ? (
        <div className="py-24 text-center space-y-3 text-muted-foreground">
          <ScrollText className="h-10 w-10 mx-auto opacity-20" />
          <p className="text-sm">Aucune entrée dans le journal.</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {['Horodatage', 'Utilisateur', 'Agence', 'Module', 'Type', 'Description'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => {
                  const action = l.action ?? l.type ?? '';
                  const module = l.module ?? 'system';
                  const modCfg = MODULE_CONFIG[module] ?? MODULE_CONFIG.system;
                  const ModIcon = modCfg.icon;
                  const op = getOpType(action);
                  const opCfg = OP_CONFIG[op];
                  const userName = l.utilisateur
                    ? `${l.utilisateur.prenom ?? ''} ${l.utilisateur.nom ?? ''}`.trim()
                    : l.utilisateurLabel ?? '—';
                  const agenceNom = l.agence?.nom ?? agences.find((a) => a.id === l.agenceId || String(a.id) === String(l.agenceId))?.nom ?? '—';
                  const description = l.description ?? l.message ?? action;
                  const timestamp = l.createdAt ?? l.timestamp ?? '';
                  return (
                    <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                        {timestamp ? formatDate(timestamp) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {userName !== '—' ? (
                          <div className="flex items-center gap-2">
                            <InitialsAvatar label={userName} />
                            <span className="text-xs font-medium whitespace-nowrap">{userName}</span>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{agenceNom}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap', modCfg.color)}>
                          <ModIcon className="h-3 w-3" />
                          {modCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap', opCfg.color)}>
                          {opCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[280px]">
                        <p className="truncate">{description}</p>
                        {action && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{action}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} / {totalPages} — {total} entrée{total !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
