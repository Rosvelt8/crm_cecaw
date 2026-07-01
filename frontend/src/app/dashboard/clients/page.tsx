'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, UserPlus, MoreVertical, ExternalLink, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { clientService } from '@/services/clientService';
import { CLIENT_STATUT_LABELS } from '@/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';

const PER_PAGE = 10;

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: PER_PAGE };
      if (search)                    params.search = search;
      if (statutFilter !== 'all')    params.statut = statutFilter;
      const res = await clientService.getClients(params as any);
      setClients(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [page, search, statutFilter]);

  useEffect(() => { load(); }, [load]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, statutFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const handleArchive = async (id: number) => {
    try {
      await clientService.updateStatut(id, 'archive');
      toast.info('Client archivé');
      await load();
    } catch { toast.error('Erreur lors de l\'archivage'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestion des Clients</h1>
          <p className="text-muted-foreground">{total} client{total !== 1 ? 's' : ''} enregistré{total !== 1 ? 's' : ''}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
          <Button variant="brand" asChild>
            <Link href="/dashboard/marketing/clients/nouveau">
              <UserPlus className="mr-2 h-4 w-4" /> Nouveau Client
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Nom, téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="h-4 w-4" />}
              className="w-full sm:max-w-sm"
            />
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="h-9 w-full sm:w-36 text-xs"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="actif">Actif</SelectItem>
                <SelectItem value="inactif">Inactif</SelectItem>
                <SelectItem value="blackliste">Blacklisté</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Agence</TableHead>
                <TableHead>Solde comptes</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Chargement…</TableCell></TableRow>
              ) : clients.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Aucun client trouvé.</TableCell></TableRow>
              ) : (
                clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-semibold text-xs text-muted-foreground">
                          {c.prenom?.[0]}{c.nom?.[0]}
                        </div>
                        <div>
                          <p className="font-medium">{c.prenom} {c.nom}</p>
                          <p className="text-xs text-muted-foreground">{c.telephone}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{c.agence?.nom ?? '—'}</TableCell>
                    <TableCell className="font-semibold text-xs">
                      {c.nb_comptes ? (
                        <span className="text-brand-600">{c.nb_comptes} compte{c.nb_comptes > 1 ? 's' : ''}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.statut === 'actif' ? 'success' : c.statut === 'blackliste' ? 'destructive' : 'outline'}>
                        {(CLIENT_STATUT_LABELS as any)[c.statut] ?? c.statut}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.createdAt ? formatDate(c.createdAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/marketing/clients/${c.id}`}>
                              <ExternalLink className="mr-2 h-4 w-4" /> Voir la fiche
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/marketing/clients/${c.id}/modifier`}>Modifier</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-amber-600" onClick={() => handleArchive(c.id)}>
                            Archiver
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
            <span>{total} client{total !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
