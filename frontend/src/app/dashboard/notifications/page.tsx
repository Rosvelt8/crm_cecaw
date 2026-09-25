'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EnTete } from '@/components/ui/kpi';
import { notificationsApi } from '@/services/metierService';
import { msg } from '@/lib/apiHelpers';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [seulementNonLues, setSeulementNonLues] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await notificationsApi.lister({ page, per_page: 20, lu: seulementNonLues ? 'false' : undefined });
      setItems(r.items); setTotal(r.meta.total ?? r.items.length); setNonLues(r.meta.non_lues ?? 0); setErreur(null);
    } catch (e) { setErreur(msg(e, 'Chargement impossible')); }
    finally { setChargement(false); }
  }, [page, seulementNonLues]);
  useEffect(() => { void charger(); }, [charger]);

  const lire = async (n: any) => {
    if (n.lu) return;
    try { await notificationsApi.lire(n.id); setItems((l) => l.map((x) => (x.id === n.id ? { ...x, lu: true } : x))); setNonLues((c) => Math.max(0, c - 1)); } catch { /* sans gravité */ }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <EnTete titre="Notifications" sousTitre={nonLues > 0 ? `${nonLues} non lue(s)` : 'Tout est à jour'}>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={seulementNonLues} onChange={(e) => { setSeulementNonLues(e.target.checked); setPage(1); }} />Non lues seulement</label>
        <Button variant="outline" size="sm" disabled={nonLues === 0} onClick={async () => { try { await notificationsApi.toutLire(); toast.success('Tout est marqué comme lu'); await charger(); } catch (e) { toast.error(msg(e)); } }}><CheckCheck className="h-4 w-4 mr-1.5" />Tout marquer comme lu</Button>
      </EnTete>

      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : chargement ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground"><Bell className="h-10 w-10 mx-auto opacity-20 mb-2" />Aucune notification.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const contenu = (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><p className={cn('text-sm', !n.lu && 'font-semibold')}>{n.titre}</p>{!n.lu && <Badge variant="brand">Nouveau</Badge>}</div>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(n.createdAt)}</p>
              </div>
            );
            return (
              <Card key={n.id} className={cn(!n.lu && 'border-brand-300 bg-brand-50/40')}>
                <CardContent className="p-3 flex items-start gap-3">
                  {n.lien ? <Link href={n.lien} className="flex-1 min-w-0 flex" onClick={() => lire(n)}>{contenu}</Link> : <div className="flex-1 min-w-0 flex cursor-pointer" onClick={() => lire(n)}>{contenu}</div>}
                  <button title="Supprimer" className="text-muted-foreground hover:text-destructive" onClick={async () => { try { await notificationsApi.supprimer(n.id); await charger(); } catch (e) { toast.error(msg(e)); } }}><Trash2 className="h-4 w-4" /></button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {total > 20 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button><span>Page {page} / {Math.ceil(total / 20)}</span><Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Suivant</Button>
        </div>
      )}
    </div>
  );
}
