'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, Download, Plus, ChevronLeft, ChevronRight, ExternalLink,
} from 'lucide-react';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { CREDIT_STATUT_LABELS, CREDIT_STATUT_COLORS } from '@/constants';
import Link from 'next/link';
import { mockCreditsStore } from '@/services/creditService';

const PER_PAGE = 6;

export default function CreditsPage() {
  const [credits, setCredits] = useState([...mockCreditsStore]);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Rafraîchir quand on revient sur la page (le store in-memory peut avoir changé)
  useEffect(() => {
    setCredits([...mockCreditsStore]);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return credits.filter((c) => {
      const matchSearch =
        !q ||
        c.ref.toLowerCase().includes(q) ||
        c.client.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q);
      const matchStatut = statutFilter === 'all' || c.statut === statutFilter;
      const matchType = typeFilter === 'all' || c.type.toLowerCase() === typeFilter.toLowerCase();
      return matchSearch && matchStatut && matchType;
    });
  }, [credits, search, statutFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const totalEncours = credits
    .filter((c) => ['decaisse', 'en_cours'].includes(c.statut))
    .reduce((sum, c) => sum + c.montant, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Portefeuille Crédits</h1>
          <p className="text-muted-foreground">
            Suivi des demandes, décaissements et remboursements.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" /> Rapports
          </Button>
          <Link href="/dashboard/credits/nouveau" className="w-full sm:w-auto">
            <Button variant="brand" className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Nouvelle Demande
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI rapide */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total dossiers', value: credits.length, unit: '' },
          { label: 'Encours actif', value: formatCurrency(totalEncours, true), unit: '' },
          { label: 'En attente analyse', value: credits.filter(c => ['en_attente','en_analyse','en_comite'].includes(c.statut)).length, unit: 'dossiers' },
          { label: 'Taux impayé', value: '3.2', unit: '%' },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{k.label}</div>
            <div className="text-xl font-bold mt-1">{k.value}{k.unit && <span className="text-sm font-normal ml-1 text-muted-foreground">{k.unit}</span>}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 flex-1 w-full sm:max-w-sm">
              <Input
                placeholder="Référence, client, type..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                icon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <Select value={statutFilter} onValueChange={(v) => { setStatutFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-full sm:w-40 text-xs">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="en_attente">En attente</SelectItem>
                  <SelectItem value="en_analyse">En analyse</SelectItem>
                  <SelectItem value="en_comite">En comité</SelectItem>
                  <SelectItem value="approuve">Approuvé</SelectItem>
                  <SelectItem value="decaisse">Décaissé</SelectItem>
                  <SelectItem value="en_cours">En cours</SelectItem>
                  <SelectItem value="rejete">Rejeté</SelectItem>
                  <SelectItem value="solde">Soldé</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-full sm:w-36 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="individuel">Individuel</SelectItem>
                  <SelectItem value="pme">PME</SelectItem>
                  <SelectItem value="solidaire">Solidaire</SelectItem>
                  <SelectItem value="agricole">Agricole</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead className="hidden sm:table-cell">Date Demande</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden lg:table-cell">Agence</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    Aucun crédit trouvé.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((credit) => (
                  <TableRow key={credit.id}>
                    <TableCell className="font-mono text-xs font-bold">{credit.ref}</TableCell>
                    <TableCell className="font-medium text-xs sm:text-sm">{credit.client}</TableCell>
                    <TableCell className="text-xs">{credit.type}</TableCell>
                    <TableCell className="font-semibold text-xs sm:text-sm">{formatCurrency(credit.montant)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{formatDate(credit.date)}</TableCell>
                    <TableCell>
                      <div className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border',
                        CREDIT_STATUT_COLORS[credit.statut as keyof typeof CREDIT_STATUT_COLORS] ?? 'bg-gray-100 text-gray-600'
                      )}>
                        {CREDIT_STATUT_LABELS[credit.statut as keyof typeof CREDIT_STATUT_LABELS] ?? credit.statut}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">{credit.agence}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/credits/${credit.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                          <ExternalLink className="h-3 w-3" /> Détails
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t text-xs text-muted-foreground gap-3">
            <span className="order-2 sm:order-1">{filtered.length} dossier{filtered.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center justify-center sm:justify-end gap-2 order-1 sm:order-2">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium text-xs px-1">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
