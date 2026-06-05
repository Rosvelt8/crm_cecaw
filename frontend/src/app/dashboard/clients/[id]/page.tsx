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
  ArrowLeft, Phone, Mail, MapPin, Calendar, User, CreditCard, PiggyBank,
  FileText, Activity, CheckCircle, Clock, XCircle, AlertTriangle,
  Building2, Edit, UserCheck, TrendingUp, Download,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { mockCreditsStore } from '@/services/creditService';
import { CLIENT_STATUT_LABELS, CREDIT_STATUT_LABELS, CREDIT_STATUT_COLORS } from '@/constants';
import { toast } from 'sonner';

type ClientStatut = 'actif' | 'prospect' | 'inactif' | 'archive' | 'blackliste';
type ClientType = 'individuel' | 'pme' | 'groupe_solidaire';

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  individuel: 'Individuel',
  pme: 'PME / Entreprise',
  groupe_solidaire: 'Groupe Solidaire',
};

const CLIENT_STATUT_VARIANT: Record<ClientStatut, 'success' | 'warning' | 'outline' | 'destructive' | 'default'> = {
  actif: 'success',
  prospect: 'warning',
  inactif: 'outline',
  archive: 'outline',
  blackliste: 'destructive',
};

const mockClientsDetail = [
  { id: 1, code: 'CL001', nom: 'Zambo', prenom: 'Paul', telephone: '699001122', email: 'p.zambo@cecaw.cm', ville: 'Douala', quartier: 'Akwa Nord', statut: 'actif' as ClientStatut, type: 'individuel' as ClientType, agence: 'Douala Akwa', encours: 1500000, dateInscription: '2024-01-15', score: 72, profession: 'Agriculteur', revenuMensuel: 350000, cni: 'CN789012345', dateNaissance: '1982-04-15', agentRef: 'Mvondo Jean', nbreCredit: 2, epargneTotal: 450000 },
  { id: 2, code: 'CL002', nom: 'Moukoko', prenom: 'Hélène', telephone: '677445566', email: 'h.moukoko@cecaw.cm', ville: 'Douala', quartier: 'Bonanjo', statut: 'prospect' as ClientStatut, type: 'individuel' as ClientType, agence: 'Douala Bonanjo', encours: 0, dateInscription: '2024-03-20', score: 58, profession: 'Commerçante', revenuMensuel: 200000, cni: 'CN456789012', dateNaissance: '1991-07-22', agentRef: 'Talla Pierre', nbreCredit: 0, epargneTotal: 80000 },
  { id: 3, code: 'CL003', nom: "Eto'o", prenom: 'Samuel', telephone: '655889900', email: 's.etoo@cecaw.cm', ville: 'Douala', quartier: 'Akwa', statut: 'actif' as ClientStatut, type: 'pme' as ClientType, agence: 'Douala Akwa', encours: 25000000, dateInscription: '2023-11-10', score: 85, profession: "Chef d'entreprise", revenuMensuel: 2500000, cni: 'CN123456789', dateNaissance: '1975-03-10', agentRef: 'Kamga Eric', nbreCredit: 3, epargneTotal: 3500000 },
  { id: 4, code: 'CL004', nom: 'Ngando', prenom: 'Pierre', telephone: '699223344', email: 'p.ngando@cecaw.cm', ville: 'Douala', quartier: 'Bassa', statut: 'inactif' as ClientStatut, type: 'individuel' as ClientType, agence: 'Douala Bassa', encours: 450000, dateInscription: '2023-08-05', score: 44, profession: 'Mécanicien', revenuMensuel: 150000, cni: 'CN987654321', dateNaissance: '1988-09-05', agentRef: 'Mvondo Jean', nbreCredit: 1, epargneTotal: 120000 },
  { id: 5, code: 'CL005', nom: 'Femmes Solidaires', prenom: 'Association', telephone: '677112233', email: 'assoc.fs@cecaw.cm', ville: 'Douala', quartier: 'Akwa', statut: 'actif' as ClientStatut, type: 'groupe_solidaire' as ClientType, agence: 'Douala Akwa', encours: 5000000, dateInscription: '2024-02-28', score: 78, profession: 'Groupe solidaire — 12 membres', revenuMensuel: 800000, cni: 'N/A', dateNaissance: 'N/A', agentRef: 'Ngassa Marie', nbreCredit: 1, epargneTotal: 950000 },
  { id: 6, code: 'CL006', nom: 'Kamga', prenom: 'Eric', telephone: '699334455', email: 'e.kamga@cecaw.cm', ville: 'Douala', quartier: 'Deido', statut: 'actif' as ClientStatut, type: 'individuel' as ClientType, agence: 'Douala Deido', encours: 750000, dateInscription: '2023-09-12', score: 65, profession: 'Artisan menuisier', revenuMensuel: 280000, cni: 'CN654321098', dateNaissance: '1985-12-18', agentRef: 'Bopda Lionel', nbreCredit: 2, epargneTotal: 230000 },
  { id: 7, code: 'CL007', nom: 'Ndoumbe', prenom: 'Sylvie', telephone: '677556677', email: 's.ndoumbe@cecaw.cm', ville: 'Douala', quartier: 'Bassa', statut: 'inactif' as ClientStatut, type: 'individuel' as ClientType, agence: 'Douala Bassa', encours: 0, dateInscription: '2022-06-01', score: 30, profession: 'Sans emploi', revenuMensuel: 80000, cni: 'CN321098765', dateNaissance: '1997-05-30', agentRef: 'Talla Pierre', nbreCredit: 0, epargneTotal: 15000 },
];

const mockEpargne = [
  { id: 1, clientId: 1, type: 'depot', montant: 150000, date: '2024-05-10', solde: 450000, ref: 'EP-2024-101' },
  { id: 2, clientId: 1, type: 'depot', montant: 200000, date: '2024-04-05', solde: 300000, ref: 'EP-2024-089' },
  { id: 3, clientId: 1, type: 'retrait', montant: 100000, date: '2024-03-20', solde: 100000, ref: 'EP-2024-055' },
  { id: 4, clientId: 3, type: 'depot', montant: 1000000, date: '2024-05-01', solde: 3500000, ref: 'EP-2024-098' },
  { id: 5, clientId: 3, type: 'depot', montant: 2000000, date: '2024-03-15', solde: 2500000, ref: 'EP-2024-060' },
  { id: 6, clientId: 5, type: 'depot', montant: 400000, date: '2024-04-28', solde: 950000, ref: 'EP-2024-092' },
  { id: 7, clientId: 5, type: 'retrait', montant: 200000, date: '2024-03-10', solde: 550000, ref: 'EP-2024-051' },
];

const mockInteractions = [
  { id: 1, clientId: 1, type: 'appel', titre: 'Suivi mensuel', note: 'Client satisfait, remboursements à jour.', date: '2024-05-08', agent: 'Mvondo Jean' },
  { id: 2, clientId: 1, type: 'visite', titre: 'Visite terrain', note: "Vérification de l'activité agricole. Bonne progression.", date: '2024-04-15', agent: 'Mvondo Jean' },
  { id: 3, clientId: 1, type: 'document', titre: 'Dépôt CNI renouvelée', note: 'Document mis à jour dans le dossier.', date: '2024-03-01', agent: 'Caisse Akwa' },
  { id: 4, clientId: 3, type: 'reunion', titre: 'Réunion plan de croissance', note: 'Discussion sur extension du crédit PME.', date: '2024-05-10', agent: 'Kamga Eric' },
  { id: 5, clientId: 3, type: 'appel', titre: 'Relance objectif', note: "Rappel des échéances Q2.", date: '2024-04-20', agent: 'Kamga Eric' },
  { id: 6, clientId: 5, type: 'reunion', titre: 'Réunion groupe solidaire', note: 'Assemblée mensuelle — 11/12 membres présents.', date: '2024-05-03', agent: 'Ngassa Marie' },
];

const mockDocuments = [
  { id: 1, clientId: 1, nom: "Carte Nationale d'Identité", statut: 'valide', expire: '2028-04-15', ref: 'DOC-CNI-001' },
  { id: 2, clientId: 1, nom: 'Justificatif de domicile', statut: 'valide', expire: null, ref: 'DOC-JD-001' },
  { id: 3, clientId: 1, nom: 'Titre foncier parcelle agricole', statut: 'valide', expire: null, ref: 'DOC-TF-001' },
  { id: 4, clientId: 3, nom: "Carte Nationale d'Identité", statut: 'valide', expire: '2029-03-10', ref: 'DOC-CNI-003' },
  { id: 5, clientId: 3, nom: "Registre de commerce", statut: 'valide', expire: '2025-12-31', ref: 'DOC-RC-003' },
  { id: 6, clientId: 3, nom: 'Plan de localisation siège', statut: 'valide', expire: null, ref: 'DOC-PL-003' },
  { id: 7, clientId: 5, nom: 'Statuts associatifs', statut: 'valide', expire: null, ref: 'DOC-SA-005' },
  { id: 8, clientId: 5, nom: 'Liste membres signée', statut: 'a_renouveler', expire: '2024-02-28', ref: 'DOC-LM-005' },
];

function getScoreColor(score: number) {
  if (score >= 75) return { bar: 'bg-success-500', text: 'text-success-700', label: 'Excellent' };
  if (score >= 60) return { bar: 'bg-yellow-400', text: 'text-yellow-700', label: 'Bon' };
  if (score >= 40) return { bar: 'bg-orange-400', text: 'text-orange-700', label: 'Moyen' };
  return { bar: 'bg-red-500', text: 'text-red-700', label: 'Faible' };
}

function getInitials(prenom: string, nom: string) {
  return `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase() || '?';
}

const INTERACTION_ICONS: Record<string, React.ElementType> = {
  appel: Phone,
  visite: MapPin,
  reunion: User,
  document: FileText,
};

type Tab = 'credits' | 'epargne' | 'activite' | 'documents';

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [activeTab, setActiveTab] = useState<Tab>('credits');

  const client = mockClientsDetail.find((c) => c.id === id);

  const clientCredits = useMemo(
    () => mockCreditsStore.filter((c) => c.clientId === String(id)),
    [id]
  );

  const clientEpargne = useMemo(
    () => mockEpargne.filter((e) => e.clientId === id),
    [id]
  );

  const clientInteractions = useMemo(
    () => mockInteractions.filter((i) => i.clientId === id),
    [id]
  );

  const clientDocuments = useMemo(
    () => mockDocuments.filter((d) => d.clientId === id),
    [id]
  );

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground opacity-40" />
        <p className="text-muted-foreground">Client introuvable.</p>
        <Button variant="outline" onClick={() => router.push('/dashboard/clients')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour à la liste
        </Button>
      </div>
    );
  }

  const scoreInfo = getScoreColor(client.score);

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'credits', label: 'Crédits', icon: CreditCard, count: clientCredits.length },
    { id: 'epargne', label: 'Épargne', icon: PiggyBank, count: clientEpargne.length },
    { id: 'activite', label: 'Activité', icon: Activity, count: clientInteractions.length },
    { id: 'documents', label: 'Documents KYC', icon: FileText, count: clientDocuments.length },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/clients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{client.prenom} {client.nom}</h1>
              <span className="text-sm font-mono text-muted-foreground">{client.code}</span>
              <Badge variant={CLIENT_STATUT_VARIANT[client.statut]}>
                {CLIENT_STATUT_LABELS[client.statut].toUpperCase()}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{CLIENT_TYPE_LABELS[client.type]} — {client.agence}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.info('Export PDF disponible avec le backend')}>
            <Download className="mr-2 h-4 w-4" /> Exporter
          </Button>
          <Button variant="brand" size="sm" onClick={() => toast.info('Modification disponible dans la liste clients')}>
            <Edit className="mr-2 h-4 w-4" /> Modifier
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4">
          {/* Avatar card */}
          <Card className="overflow-hidden">
            <div className="h-16 bg-brand-600" />
            <CardContent className="pt-0 -mt-8 flex flex-col items-center text-center pb-6">
              <div className="h-16 w-16 rounded-full border-4 border-background bg-brand-100 flex items-center justify-center text-brand-700 font-black text-xl shadow-md">
                {getInitials(client.prenom, client.nom)}
              </div>
              <h2 className="mt-3 font-bold">{client.prenom} {client.nom}</h2>
              <p className="text-xs text-muted-foreground">{client.profession}</p>
              <div className="mt-3 w-full space-y-2 text-left">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{client.telephone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{client.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{client.quartier}, {client.ville}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Depuis {new Date(client.dateInscription).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Suivi par {client.agentRef}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Score card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Score de Crédit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between">
                <span className={cn('text-4xl font-black', scoreInfo.text)}>{client.score}</span>
                <span className={cn('text-sm font-bold', scoreInfo.text)}>{scoreInfo.label}</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', scoreInfo.bar)}
                  style={{ width: `${client.score}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Score sur 100 basé sur l'historique de remboursement, la durée de la relation et la capacité de remboursement.</p>
            </CardContent>
          </Card>

          {/* KPI summary */}
          <Card>
            <CardContent className="pt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Encours</div>
                <div className="text-sm font-black mt-1">{formatCurrency(client.encours)}</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Épargne</div>
                <div className="text-sm font-black mt-1">{formatCurrency(client.epargneTotal)}</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Crédits</div>
                <div className="text-sm font-black mt-1">{clientCredits.length}</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Revenu</div>
                <div className="text-sm font-black mt-1">{formatCurrency(client.revenuMensuel)}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={cn(
                    'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    activeTab === tab.id ? 'bg-brand-100 text-brand-700' : 'bg-muted text-muted-foreground'
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab: Crédits */}
          {activeTab === 'credits' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Historique des crédits</CardTitle>
                <CardDescription>Tous les dossiers de crédit associés à ce client.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {clientCredits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
                    <CreditCard className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Aucun crédit enregistré pour ce client.</p>
                    <Link href="/dashboard/credits/nouveau">
                      <Button size="sm" variant="brand">Nouvelle demande</Button>
                    </Link>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Référence</TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientCredits.map((cr) => (
                        <TableRow key={cr.id}>
                          <TableCell className="font-mono text-xs font-bold">{cr.ref}</TableCell>
                          <TableCell className="text-sm">{cr.produit}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{formatCurrency(cr.montant)}</TableCell>
                          <TableCell>
                            <span className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                              CREDIT_STATUT_COLORS[cr.statut as keyof typeof CREDIT_STATUT_COLORS] || 'bg-muted text-muted-foreground'
                            )}>
                              {CREDIT_STATUT_LABELS[cr.statut as keyof typeof CREDIT_STATUT_LABELS] || cr.statut}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(cr.date).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell>
                            <Link href={`/dashboard/credits/${cr.id}`}>
                              <Button variant="ghost" size="sm" className="text-xs h-7">Voir</Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab: Épargne */}
          {activeTab === 'epargne' && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Compte d'épargne</CardTitle>
                    <CardDescription>Historique des dépôts et retraits.</CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Solde actuel</div>
                    <div className="text-2xl font-black text-success-700">{formatCurrency(client.epargneTotal)}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {clientEpargne.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
                    <PiggyBank className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Aucune transaction d'épargne enregistrée.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Référence</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead className="text-right">Solde après</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientEpargne.map((ep) => (
                        <TableRow key={ep.id}>
                          <TableCell className="font-mono text-xs font-bold">{ep.ref}</TableCell>
                          <TableCell>
                            <Badge variant={ep.type === 'depot' ? 'success' : 'warning'}>
                              {ep.type === 'depot' ? 'Dépôt' : 'Retrait'}
                            </Badge>
                          </TableCell>
                          <TableCell className={cn(
                            'text-right text-sm font-semibold',
                            ep.type === 'depot' ? 'text-success-700' : 'text-orange-600'
                          )}>
                            {ep.type === 'depot' ? '+' : '-'}{formatCurrency(ep.montant)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">{formatCurrency(ep.solde)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(ep.date).toLocaleDateString('fr-FR')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab: Activité */}
          {activeTab === 'activite' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Journal d'activité</CardTitle>
                <CardDescription>Historique des interactions avec ce client.</CardDescription>
              </CardHeader>
              <CardContent>
                {clientInteractions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
                    <Activity className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Aucune interaction enregistrée.</p>
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-6">
                    <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border" />
                    {clientInteractions.map((interaction, idx) => {
                      const Icon = INTERACTION_ICONS[interaction.type] || Activity;
                      return (
                        <div key={interaction.id} className="relative">
                          <div className="absolute -left-6 h-5 w-5 rounded-full bg-brand-100 border-2 border-brand-300 flex items-center justify-center">
                            <Icon className="h-2.5 w-2.5 text-brand-600" />
                          </div>
                          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold">{interaction.titre}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(interaction.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{interaction.note}</p>
                            <div className="flex items-center gap-1.5 pt-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">{interaction.agent}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab: Documents KYC */}
          {activeTab === 'documents' && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Documents KYC</CardTitle>
                    <CardDescription>Pièces justificatives et documents réglementaires.</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toast.info('Upload de document disponible avec le backend')}>
                    Ajouter un document
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {clientDocuments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
                    <FileText className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Aucun document enregistré.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clientDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center',
                            doc.statut === 'valide' ? 'bg-success-50' : 'bg-warning-50'
                          )}>
                            {doc.statut === 'valide'
                              ? <CheckCircle className="h-4 w-4 text-success-600" />
                              : <AlertTriangle className="h-4 w-4 text-warning-600" />
                            }
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{doc.nom}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{doc.ref}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {doc.expire && (
                            <span className="text-[10px] text-muted-foreground">
                              Expire: {new Date(doc.expire).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                          <Badge variant={doc.statut === 'valide' ? 'success' : 'warning'}>
                            {doc.statut === 'valide' ? 'Valide' : 'À renouveler'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => toast.info('Téléchargement disponible avec le backend')}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
