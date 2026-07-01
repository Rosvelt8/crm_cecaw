'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, Plus, ArrowUpRight, ArrowDownLeft, History, PiggyBank,
  RefreshCw, MoreVertical, Download, X,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type TxType = 'depot' | 'retrait';
type TxStatut = 'valide' | 'en_attente';

interface Transaction {
  id: number;
  client: string;
  compte: string;
  type: TxType;
  montant: number;
  date: string;
  statut: TxStatut;
  agent: string;
}

let txCounter = 10;
const initialTransactions: Transaction[] = [
  { id: 1, client: 'Zambo Paul', type: 'depot', montant: 50000, date: '2024-05-16T10:30:00', compte: 'EP-4420-X', statut: 'valide', agent: 'Mvondo Jean' },
  { id: 2, client: 'Moukoko Hélène', type: 'retrait', montant: 25000, date: '2024-05-16T09:15:00', compte: 'EP-9102-B', statut: 'valide', agent: 'Kamga Eric' },
  { id: 3, client: 'Kamga Eric', type: 'depot', montant: 100000, date: '2024-05-15T16:45:00', compte: 'EP-1150-Z', statut: 'valide', agent: 'Mvondo Jean' },
  { id: 4, client: 'Ngassa Marie', type: 'depot', montant: 15000, date: '2024-05-15T14:20:00', compte: 'EP-3301-C', statut: 'valide', agent: 'Talla Pierre' },
  { id: 5, client: "Eto'o Samuel", type: 'retrait', montant: 500000, date: '2024-05-15T11:00:00', compte: 'EP-0001-A', statut: 'en_attente', agent: 'Ngassa Marie' },
];

const collecteurs = [
  { name: 'Mvondo Jean', amount: 450000, count: 28, status: 'actif' },
  { name: 'Kamga Eric', amount: 320000, count: 15, status: 'actif' },
  { name: 'Ngassa Marie', amount: 180000, count: 12, status: 'pause' },
];

type ModalType = 'depot' | 'retrait' | null;

export default function EpargnePage() {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [modal, setModal] = useState<ModalType>(null);
  const [form, setForm] = useState({ client: '', compte: '', montant: '', motif: '' });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions.filter((t) => {
      const matchSearch = !q || t.client.toLowerCase().includes(q) || t.compte.toLowerCase().includes(q);
      const matchType = typeFilter === 'all' || t.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [transactions, search, typeFilter]);

  const totalCollecteJour = transactions
    .filter((t) => t.type === 'depot' && t.statut === 'valide' && t.date.startsWith('2024-05-16'))
    .reduce((s, t) => s + t.montant, 0);

  const enAttente = transactions.filter((t) => t.statut === 'en_attente').length;

  const openModal = (type: ModalType) => {
    setForm({ client: '', compte: '', montant: '', motif: '' });
    setModal(type);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client.trim() || !form.montant || Number(form.montant) <= 0) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    const newTx: Transaction = {
      id: ++txCounter,
      client: form.client,
      compte: form.compte || `EP-${Math.floor(Math.random() * 9000 + 1000)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
      type: modal!,
      montant: Number(form.montant),
      date: new Date().toISOString(),
      statut: 'valide',
      agent: 'Agent connecté',
    };
    setTransactions((prev) => [newTx, ...prev]);
    toast.success(
      modal === 'depot'
        ? `Dépôt de ${formatCurrency(newTx.montant)} enregistré`
        : `Retrait de ${formatCurrency(newTx.montant)} enregistré`,
      { description: `Client : ${newTx.client}` }
    );
    setModal(null);
  };

  const validerTx = (id: number) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, statut: 'valide' as TxStatut } : t))
    );
    toast.success('Transaction validée');
  };

  return (
    <div className="space-y-6 px-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Gestion de l'Épargne</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Collecte journalière, gestion des comptes et suivi des transactions.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto text-xs" onClick={() => toast.info('Export en cours de développement')}>
            <History className="mr-2 h-4 w-4" /> Historique
          </Button>
          <Button variant="success" className="w-full sm:w-auto text-xs" onClick={() => openModal('depot')}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau Dépôt
          </Button>
          <Button variant="brand" className="w-full sm:w-auto text-xs" onClick={() => openModal('retrait')}>
            <ArrowDownLeft className="mr-2 h-4 w-4" /> Nouveau Retrait
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-brand-600 to-brand-800 text-white border-none shadow-glow-blue overflow-hidden relative group">
          <div className="absolute right-[-20px] top-[-20px] opacity-10 group-hover:scale-110 transition-transform duration-500">
            <PiggyBank className="h-32 w-32" />
          </div>
          <div className="relative z-10">
            <p className="text-brand-100 text-xs font-medium uppercase tracking-wider">Total Épargne Cecaw Finance</p>
            <h3 className="text-2xl font-bold mt-1">{formatCurrency(82450000, true)}</h3>
            <div className="mt-4 flex items-center gap-2 text-xs text-brand-200">
              <span className="bg-white/20 px-1.5 py-0.5 rounded text-white">+8.2%</span>
              <span>vs mois dernier</span>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card card-hover">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Collecte du jour</p>
          <h3 className="text-2xl font-bold mt-1 text-success-600">{formatCurrency(totalCollecteJour || 165000)}</h3>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">{transactions.filter(t => t.type === 'depot').length} dépôts</div>
            <Badge variant="success">En hausse</Badge>
          </div>
        </Card>
        <Card className="p-4 bg-card card-hover">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Nouveaux Comptes (Mois)</p>
          <h3 className="text-2xl font-bold mt-1">124</h3>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Objectif: 150</div>
            <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 w-[82%]" />
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card card-hover">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">En attente validation</p>
          <h3 className={cn('text-2xl font-bold mt-1', enAttente > 0 ? 'text-warning-600' : 'text-muted-foreground')}>
            {enAttente}
          </h3>
          <div className="mt-4 flex items-center gap-2">
            {enAttente > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => toast.info('Voir les transactions en attente')}>
                Voir les alertes
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 grid-cols-1">
        {/* Table Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Transactions Récentes</CardTitle>
              <CardDescription className="text-xs">Suivi en temps réel des dépôts et retraits.</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <Input
                placeholder="Rechercher..."
                className="h-8 w-full sm:w-40 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-3 w-3" />}
              />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-full sm:w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="depot">Dépôts</SelectItem>
                  <SelectItem value="retrait">Retraits</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 w-full sm:w-auto text-xs">
                <Download className="h-3 w-3 mr-1" /> Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Client / Compte</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Montant</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-right text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Aucune transaction.</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-xs">{tx.client}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{tx.compte}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-bold uppercase whitespace-nowrap',
                          tx.type === 'depot' ? 'text-success-600' : 'text-danger-600'
                        )}>
                          {tx.type === 'depot' ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : <ArrowDownLeft className="h-3 w-3 shrink-0" />}
                          <span className="hidden sm:inline">{tx.type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-xs whitespace-nowrap">{formatCurrency(tx.montant)}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground hidden sm:table-cell whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                      <TableCell>
                        <Badge variant={tx.statut === 'valide' ? 'success' : 'warning'} className="text-[9px] h-4 px-1 whitespace-nowrap">
                          {tx.statut === 'valide' ? 'Validé' : 'Attente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.statut === 'en_attente' ? (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => validerTx(tx.id)}>
                            Valider
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sidebar Collecteurs */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Collecteurs Terrain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {collecteurs.map((col, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-muted-foreground/5 hover:bg-muted/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-[10px]">
                      {col.name.split(' ')[0][0]}{col.name.split(' ')[1][0]}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">{col.name}</span>
                      <span className="text-[10px] text-muted-foreground">{col.count} collectes • {col.status}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-brand-600">{formatCurrency(col.amount, true)}</div>
                    <RefreshCw className="h-3 w-3 text-muted-foreground ml-auto mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
              <Button variant="ghost" className="w-full text-xs h-8 border border-dashed border-muted-foreground/20">
                Voir tous les collecteurs
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-brand-900 text-white border-none">
            <CardHeader>
              <CardTitle className="text-sm">Objectif Collecte Mai</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold">78%</span>
                <span className="text-[10px] text-brand-200 uppercase font-medium tracking-widest">Atteint</span>
              </div>
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-brand-400 w-[78%] shadow-[0_0_10px_rgba(96,165,250,0.5)]" />
              </div>
              <p className="text-[10px] text-brand-200">
                Plus que <span className="text-white font-bold">{formatCurrency(22000000, true)}</span> pour atteindre l'objectif mensuel.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal Dépôt / Retrait */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className={cn(
              'border-b p-4 flex items-center justify-between rounded-t-xl',
              modal === 'depot' ? 'bg-success-50/50' : 'bg-brand-50/50'
            )}>
              <div className="flex items-center gap-3">
                {modal === 'depot'
                  ? <ArrowUpRight className="h-6 w-6 text-success-600" />
                  : <ArrowDownLeft className="h-6 w-6 text-brand-600" />
                }
                <div>
                  <h2 className="text-lg font-bold">{modal === 'depot' ? 'Nouveau Dépôt' : 'Nouveau Retrait'}</h2>
                  <p className="text-xs text-muted-foreground">Enregistrement d'une opération d'épargne</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setModal(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Nom du client <span className="text-red-500">*</span></Label>
                <Input
                  required
                  value={form.client}
                  onChange={(e) => setForm({ ...form, client: e.target.value })}
                  placeholder="Ex : Zambo Paul"
                />
              </div>
              <div className="space-y-2">
                <Label>N° de compte épargne</Label>
                <Input
                  value={form.compte}
                  onChange={(e) => setForm({ ...form, compte: e.target.value })}
                  placeholder="Ex : EP-4420-X (auto si vide)"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Montant (FCFA) <span className="text-red-500">*</span></Label>
                <Input
                  required
                  type="number"
                  min="100"
                  value={form.montant}
                  onChange={(e) => setForm({ ...form, montant: e.target.value })}
                  placeholder="Ex : 50 000"
                />
                {form.montant && Number(form.montant) > 0 && (
                  <p className="text-xs text-muted-foreground">{formatCurrency(Number(form.montant))}</p>
                )}
              </div>
              {modal === 'retrait' && (
                <div className="space-y-2">
                  <Label>Motif du retrait</Label>
                  <Input
                    value={form.motif}
                    onChange={(e) => setForm({ ...form, motif: e.target.value })}
                    placeholder="Ex : Dépenses médicales"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
                <Button type="submit" variant={modal === 'depot' ? 'success' : 'brand'}>
                  {modal === 'depot' ? 'Enregistrer le dépôt' : 'Enregistrer le retrait'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
