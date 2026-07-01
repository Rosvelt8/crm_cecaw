'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, CheckCircle, Clock, XCircle, AlertTriangle, TrendingUp,
  User, Building2, Calendar, FileText, Shield, Download, Printer,
  ThumbsUp, ThumbsDown, ChevronRight, CreditCard, Banknote,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { mockCreditsStore } from '@/services/creditService';
import { CREDIT_STATUT_LABELS, CREDIT_STATUT_COLORS } from '@/constants';
import { toast } from 'sonner';

type CreditStatut = keyof typeof CREDIT_STATUT_LABELS;

const GARANTIE_LABELS: Record<string, string> = {
  salaire: 'Domiciliation de salaire',
  immobilier: 'Hypothèque immobilière',
  tiers_garant: 'Caution de tiers',
  materiel: 'Nantissement matériel',
  fonds_commerce: 'Fonds de commerce',
};

const FREQUENCE_LABELS: Record<string, string> = {
  mensuel: 'Mensuelle',
  hebdomadaire: 'Hebdomadaire',
  bimensuel: 'Bi-mensuelle',
  trimestriel: 'Trimestrielle',
};

type WorkflowStep = {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
  date?: string;
};

function getWorkflow(statut: string): WorkflowStep[] {
  const steps = [
    { key: 'en_attente', label: 'Dépôt de dossier', done: false, active: false },
    { key: 'en_analyse', label: 'Analyse de crédit', done: false, active: false },
    { key: 'en_comite', label: 'Passage en comité', done: false, active: false },
    { key: 'approuve', label: 'Approbation', done: false, active: false },
    { key: 'decaisse', label: 'Décaissement', done: false, active: false },
  ];

  const order: Record<string, number> = {
    en_attente: 0,
    en_analyse: 1,
    en_comite: 2,
    approuve: 3,
    decaisse: 4,
    en_cours: 4,
    solde: 4,
    rejete: 3,
  };

  const currentIdx = order[statut] ?? 0;

  return steps.map((step, idx) => ({
    ...step,
    done: idx < currentIdx || (statut === 'decaisse' || statut === 'en_cours' || statut === 'solde'),
    active: idx === currentIdx && statut !== 'rejete' && statut !== 'solde',
  }));
}

function calcEcheancier(montant: number, duree: number, tauxAnnuel = 0.18) {
  const r = tauxAnnuel / 12;
  const mensualite = r === 0
    ? montant / duree
    : (montant * r) / (1 - Math.pow(1 + r, -duree));

  let solde = montant;
  const rows = [];
  const today = new Date();

  for (let i = 1; i <= duree; i++) {
    const interet = solde * r;
    const capital = mensualite - interet;
    solde = Math.max(0, solde - capital);
    const echeance = new Date(today);
    echeance.setMonth(echeance.getMonth() + i);
    rows.push({
      num: i,
      date: echeance.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      mensualite: Math.round(mensualite),
      capital: Math.round(capital),
      interet: Math.round(interet),
      solde: Math.round(solde),
      statut: i < Math.ceil(duree * 0.3) ? 'paye' : i === Math.ceil(duree * 0.3) + 1 ? 'en_cours' : 'a_venir',
    });
  }
  return rows;
}

type Tab = 'details' | 'echeancier' | 'garanties';

export default function CreditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [actionLoading, setActionLoading] = useState(false);

  const credit = useMemo(
    () => mockCreditsStore.find((c) => c.id === id),
    [id]
  );

  const echeancier = useMemo(
    () => credit ? calcEcheancier(credit.montant, credit.duree) : [],
    [credit]
  );

  if (!credit) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground opacity-40" />
        <p className="text-muted-foreground">Dossier de crédit introuvable.</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/credits')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour à la liste
        </Button>
      </div>
    );
  }

  const mensualite = echeancier[0]?.mensualite ?? 0;
  const totalInterets = echeancier.reduce((sum, r) => sum + r.interet, 0);
  const workflow = getWorkflow(credit.statut);

  const statut = credit.statut as CreditStatut;
  const statutLabel = CREDIT_STATUT_LABELS[statut] || credit.statut;
  const statutColor = CREDIT_STATUT_COLORS[statut] || 'bg-muted text-muted-foreground';

  const handleAction = (action: string) => {
    setActionLoading(true);
    setTimeout(() => {
      setActionLoading(false);
      toast.success(`Action "${action}" enregistrée — intégration backend requise.`);
    }, 1000);
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'details', label: 'Détails', icon: FileText },
    { id: 'echeancier', label: 'Échéancier', icon: Calendar },
    { id: 'garanties', label: 'Garanties', icon: Shield },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0 mt-1" onClick={() => router.push('/dashboard/credits')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold font-mono break-all">{credit.ref}</h1>
              <span className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide shrink-0',
                statutColor
              )}>
                {statutLabel}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
              {credit.client} — {credit.type} — {credit.agence}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs" onClick={() => toast.info('Impression disponible avec le backend')}>
            <Printer className="mr-2 h-4 w-4" /> Imprimer
          </Button>
          <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs" onClick={() => toast.info('Export PDF disponible avec le backend')}>
            <Download className="mr-2 h-4 w-4" /> Exporter
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Montant</div>
            <div className="text-xl font-black mt-1">{formatCurrency(credit.montant)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Durée</div>
            <div className="text-xl font-black mt-1">{credit.duree} mois</div>
            <div className="text-[10px] text-muted-foreground">{FREQUENCE_LABELS[credit.frequence] || credit.frequence}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Mensualité</div>
            <div className="text-xl font-black mt-1">{formatCurrency(mensualite)}</div>
            <div className="text-[10px] text-muted-foreground">taux 18%/an</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Coût total</div>
            <div className="text-xl font-black mt-1">{formatCurrency(credit.montant + totalInterets)}</div>
            <div className="text-[10px] text-muted-foreground">dont {formatCurrency(totalInterets)} d'intérêts</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 grid-cols-1">
        {/* Left: Workflow + Actions */}
        <div className="space-y-4 lg:col-span-1">
          {/* Workflow */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Workflow du dossier</CardTitle>
            </CardHeader>
            <CardContent>
              {credit.statut === 'rejete' && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <span className="text-xs text-red-700 font-semibold">Dossier rejeté par le comité</span>
                </div>
              )}
              <div className="relative pl-6 space-y-4">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
                {workflow.map((step) => (
                  <div key={step.key} className="relative flex items-start gap-3">
                    <div className={cn(
                      'absolute -left-6 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                      step.done ? 'bg-success-500 border-success-500' :
                      step.active ? 'bg-brand-600 border-brand-600 ring-4 ring-brand-100' :
                      credit.statut === 'rejete' && step.key === 'approuve' ? 'bg-red-500 border-red-500' :
                      'bg-background border-border'
                    )}>
                      {step.done && <CheckCircle className="h-2.5 w-2.5 text-white" />}
                      {step.active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      {credit.statut === 'rejete' && step.key === 'approuve' && <XCircle className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <div className="pt-0.5">
                      <p className={cn(
                        'text-sm font-semibold',
                        step.done ? 'text-foreground' :
                        step.active ? 'text-brand-600' :
                        'text-muted-foreground'
                      )}>
                        {step.label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(credit.statut === 'en_attente' || credit.statut === 'en_analyse') && (
                <>
                  <Button
                    className="w-full justify-start h-9 text-sm font-semibold"
                    variant="brand"
                    loading={actionLoading}
                    onClick={() => handleAction('Passer en comité')}
                  >
                    <ChevronRight className="mr-2 h-4 w-4" />
                    Passer en comité
                  </Button>
                  <Button
                    className="w-full justify-start h-9 text-sm"
                    variant="outline"
                    onClick={() => handleAction('Demander pièce complémentaire')}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Demander pièce
                  </Button>
                </>
              )}
              {credit.statut === 'en_comite' && (
                <>
                  <Button
                    className="w-full justify-start h-9 text-sm font-semibold bg-success-600 hover:bg-success-700 text-white"
                    variant="outline"
                    loading={actionLoading}
                    onClick={() => handleAction('Approuver le dossier')}
                  >
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Approuver
                  </Button>
                  <Button
                    className="w-full justify-start h-9 text-sm font-semibold text-red-600 hover:bg-red-50 border-red-200"
                    variant="outline"
                    onClick={() => handleAction('Rejeter le dossier')}
                  >
                    <ThumbsDown className="mr-2 h-4 w-4" />
                    Rejeter
                  </Button>
                </>
              )}
              {credit.statut === 'approuve' && (
                <Button
                  className="w-full justify-start h-9 text-sm font-semibold"
                  variant="brand"
                  loading={actionLoading}
                  onClick={() => handleAction('Décaisser le crédit')}
                >
                  <Banknote className="mr-2 h-4 w-4" />
                  Décaisser
                </Button>
              )}
              {(credit.statut === 'decaisse' || credit.statut === 'en_cours') && (
                <>
                  <Button
                    className="w-full justify-start h-9 text-sm"
                    variant="outline"
                    onClick={() => handleAction('Enregistrer remboursement')}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Enregistrer remboursement
                  </Button>
                  <Button
                    className="w-full justify-start h-9 text-sm text-warning-700 border-warning-200 hover:bg-warning-50"
                    variant="outline"
                    onClick={() => handleAction('Signaler impayé')}
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Signaler impayé
                  </Button>
                </>
              )}
              {credit.statut === 'rejete' && (
                <Button
                  className="w-full justify-start h-9 text-sm"
                  variant="outline"
                  onClick={() => handleAction('Réouvrir le dossier')}
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Réouvrir le dossier
                </Button>
              )}
              <Separator />
              <Link href={`/dashboard/clients/${credit.clientId}`}>
                <Button className="w-full justify-start h-9 text-xs text-muted-foreground" variant="ghost">
                  <User className="mr-2 h-3.5 w-3.5" />
                  Voir la fiche client
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Right: Tabs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b overflow-x-auto -mx-4 px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors shrink-0',
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab: Détails */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Informations du dossier</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Client</dt>
                      <dd className="font-semibold flex items-center gap-2 text-xs sm:text-sm break-words">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Link href={`/dashboard/clients/${credit.clientId}`} className="text-brand-600 hover:underline">
                          {credit.client}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Produit</dt>
                      <dd className="font-semibold text-xs sm:text-sm">{credit.produit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Type de crédit</dt>
                      <dd className="font-semibold text-xs sm:text-sm">{credit.type}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Agence</dt>
                      <dd className="font-semibold flex items-center gap-2 text-xs sm:text-sm">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {credit.agence}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Agent responsable</dt>
                      <dd className="font-semibold text-xs sm:text-sm">{credit.agent}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Date de dépôt</dt>
                      <dd className="font-semibold flex items-center gap-2 text-xs sm:text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {new Date(credit.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Fréquence</dt>
                      <dd className="font-semibold text-xs sm:text-sm">{FREQUENCE_LABELS[credit.frequence] || credit.frequence}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Référence</dt>
                      <dd className="font-mono font-bold text-xs sm:text-sm break-all">{credit.ref}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Objet du financement</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-foreground bg-muted/40 rounded-lg p-4">
                    {credit.objet || 'Aucun objet précisé.'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tab: Échéancier */}
          {activeTab === 'echeancier' && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Plan de remboursement</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {credit.duree} échéances — {formatCurrency(mensualite)}/mois — taux annuel 18%
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs" onClick={() => toast.info('Export Excel disponible avec le backend')}>
                    <Download className="mr-2 h-4 w-4" /> Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <div className="max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-8 text-xs">#</TableHead>
                        <TableHead className="text-xs">Échéance</TableHead>
                        <TableHead className="text-right text-xs">Mensualité</TableHead>
                        <TableHead className="text-right text-xs hidden sm:table-cell">Capital</TableHead>
                        <TableHead className="text-right text-xs hidden md:table-cell">Intérêts</TableHead>
                        <TableHead className="text-right text-xs">Solde</TableHead>
                        <TableHead className="text-xs" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {echeancier.map((row) => (
                        <TableRow
                          key={row.num}
                          className={cn(
                            row.statut === 'paye' && 'bg-success-50/40',
                            row.statut === 'en_cours' && 'bg-brand-50/40 font-medium'
                          )}
                        >
                          <TableCell className="text-xs text-muted-foreground font-mono">{row.num}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{row.date}</TableCell>
                          <TableCell className="text-right text-xs sm:text-sm font-semibold whitespace-nowrap">{formatCurrency(row.mensualite)}</TableCell>
                          <TableCell className="text-right text-xs hidden sm:table-cell whitespace-nowrap">{formatCurrency(row.capital)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">{formatCurrency(row.interet)}</TableCell>
                          <TableCell className="text-right text-xs font-mono whitespace-nowrap">{formatCurrency(row.solde)}</TableCell>
                          <TableCell>
                            {row.statut === 'paye' && (
                              <CheckCircle className="h-3.5 w-3.5 text-success-500 shrink-0" />
                            )}
                            {row.statut === 'en_cours' && (
                              <Clock className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t bg-muted/30 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Total remboursé</div>
                    <div className="text-xs sm:text-sm font-black break-words">{formatCurrency(credit.montant + totalInterets)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Capital</div>
                    <div className="text-xs sm:text-sm font-black break-words">{formatCurrency(credit.montant)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Intérêts</div>
                    <div className="text-xs sm:text-sm font-black text-warning-700 break-words">{formatCurrency(totalInterets)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tab: Garanties */}
          {activeTab === 'garanties' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Garantie principale</CardTitle>
                  <CardDescription>Sûreté prise en couverture du risque de crédit.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/40">
                    <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <Shield className="h-5 w-5 text-brand-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold">
                        {GARANTIE_LABELS[credit.garantieType] || credit.garantieType || 'Non précisé'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Valeur estimée : <span className="font-semibold text-foreground">{formatCurrency(credit.garantieValeur)}</span>
                      </p>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Taux de couverture</span>
                          <span className="font-bold">
                            {credit.garantieValeur > 0
                              ? `${Math.round((credit.garantieValeur / credit.montant) * 100)}%`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              (credit.garantieValeur / credit.montant) >= 1.5 ? 'bg-success-500' :
                              (credit.garantieValeur / credit.montant) >= 1 ? 'bg-yellow-400' : 'bg-red-400'
                            )}
                            style={{ width: `${Math.min(100, (credit.garantieValeur / credit.montant) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {(credit.garantieValeur / credit.montant) >= 1.5
                            ? 'Couverture excellente (≥150% du montant)'
                            : (credit.garantieValeur / credit.montant) >= 1
                            ? 'Couverture suffisante (≥100% du montant)'
                            : 'Couverture insuffisante (<100% du montant)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Analyse risque</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b">
                      <dt className="text-muted-foreground">Ratio charge/revenu</dt>
                      <dd className="font-bold">
                        {credit.garantieValeur > 0
                          ? `${Math.round((echeancier[0]?.mensualite ?? 0) / (credit.garantieValeur / 8.33) * 100)}%`
                          : 'N/A'}
                      </dd>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <dt className="text-muted-foreground">Durée (mois)</dt>
                      <dd className="font-bold">{credit.duree}</dd>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <dt className="text-muted-foreground">Taux d'intérêt annuel</dt>
                      <dd className="font-bold">18,00%</dd>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <dt className="text-muted-foreground">Valeur garantie / Montant</dt>
                      <dd className={cn(
                        'font-bold',
                        (credit.garantieValeur / credit.montant) >= 1.5 ? 'text-success-700' :
                        (credit.garantieValeur / credit.montant) >= 1 ? 'text-yellow-700' : 'text-red-600'
                      )}>
                        {credit.garantieValeur > 0
                          ? `${(credit.garantieValeur / credit.montant).toFixed(2)}x`
                          : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
