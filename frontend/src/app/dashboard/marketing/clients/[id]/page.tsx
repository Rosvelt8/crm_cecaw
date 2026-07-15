'use client';

import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { useRouter, useParams } from 'next/navigation';
import { clientService } from '@/services/clientService';
import { compteService } from '@/services/compteService';
import { produitService } from '@/services/produitService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Pencil, Plus, Trash2, Check, X,
  ArrowUpCircle, ArrowDownCircle, BookOpen, ArrowLeftRight,
  Phone, Mail, MapPin, Briefcase, Users, Shield,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const STATUT_CLIENT_COLOR: Record<string, string> = {
  actif:      'bg-emerald-100 text-emerald-700',
  inactif:    'bg-slate-100 text-slate-600',
  blackliste: 'bg-red-100 text-red-700',
};

const STATUT_COMPTE_COLOR: Record<string, string> = {
  actif:    'bg-emerald-100 text-emerald-700',
  suspendu: 'bg-amber-100 text-amber-700',
  clos:     'bg-slate-100 text-slate-500',
};

type CompteForm = { produitId: string; solde: string; statut: string; dateOuverture: string };
const EMPTY_COMPTE: CompteForm = { produitId: '', solde: '0', statut: 'actif', dateOuverture: new Date().toISOString().split('T')[0] };

const compteSchema = z.object({
  produitId: z.string().trim().min(1, 'Produit requis'),
  solde: z.string().trim().refine((v) => v === '' || Number(v) >= 0, 'Le solde initial doit être positif ou nul'),
  dateOuverture: z.string().trim().min(1, "Date d'ouverture requise"),
});

function validateCompteForm(form: CompteForm): Record<string, string> | null {
  const result = compteSchema.safeParse(form);
  if (result.success) return null;
  const errors: Record<string, string> = {};
  result.error.issues.forEach((issue) => { errors[String(issue.path[0])] = issue.message; });
  return errors;
}

type TxForm = { type: 'credit' | 'debit'; montant: string; motif: string };

const SituationLabel: Record<string, string> = {
  celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf/Veuve',
};

export default function ClientDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { isAgent, canDelete, utilisateurId } = useAuth();

  const [client, setClient] = useState<any | null>(null);
  const [comptes, setComptes] = useState<any[]>([]);
  const [recentTx, setRecentTx] = useState<Record<string, any[]>>({});
  const [produits, setProduits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [compteModal, setCompteModal] = useState<'create' | { id: number | string } | null>(null);
  const [compteForm, setCompteForm] = useState<CompteForm>(EMPTY_COMPTE);
  const [compteErrors, setCompteErrors] = useState<Record<string, string>>({});
  const [confirmCompteId, setConfirmCompteId] = useState<number | string | null>(null);
  const [savingCompte, setSavingCompte] = useState(false);

  const [txModal, setTxModal] = useState<any | null>(null);
  const [txForm, setTxForm] = useState<TxForm>({ type: 'credit', montant: '', motif: '' });
  const [savingTx, setSavingTx] = useState(false);

  const loadComptes = useCallback(async () => {
    const data = await clientService.getComptes(id);
    setComptes(data ?? []);
    // Load 3 recent transactions per compte
    const txMap: Record<string, any[]> = {};
    await Promise.all(
      (data ?? []).map(async (cp: any) => {
        try {
          const res = await compteService.getTransactions(cp.id, { per_page: 3 });
          txMap[String(cp.id)] = res.data ?? [];
        } catch {
          txMap[String(cp.id)] = [];
        }
      })
    );
    setRecentTx(txMap);
  }, [id]);

  useEffect(() => {
    Promise.all([
      clientService.getClient(id),
      produitService.getProduits({ actif: true, per_page: 100 }),
    ]).then(([c, pRes]) => {
      setClient(c);
      setProduits(pRes.data ?? []);
    }).catch(() => {
      toast.error('Client introuvable');
      router.back();
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!loading) loadComptes();
  }, [loading, loadComptes]);

  if (loading) return <div className="py-32 text-center text-muted-foreground text-sm">Chargement…</div>;

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-muted-foreground">Client introuvable.</p>
        <Button variant="ghost" onClick={() => router.back()}>Retour</Button>
      </div>
    );
  }

  if (isAgent && String(client.commercialId ?? client.commercial?.id) !== utilisateurId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-muted-foreground">Accès refusé — ce client ne vous appartient pas.</p>
        <Button variant="ghost" onClick={() => router.back()}>Retour</Button>
      </div>
    );
  }

  const agenceNom    = client.agence?.nom ?? '—';
  const commercialNom = client.commercial
    ? `${client.commercial.prenom} ${client.commercial.nom}`
    : '—';
  const getProduitNom = (pid: any) => produits.find((p) => String(p.id) === String(pid))?.nom ?? '—';
  const soldeTotalActif = comptes.filter((cp) => cp.statut === 'actif').reduce((s, cp) => s + (cp.solde ?? 0), 0);
  const totalTxCount = Object.values(recentTx).flat().length;

  // ── Compte handlers ──
  const openCompteCreate = () => { setCompteForm(EMPTY_COMPTE); setCompteErrors({}); setCompteModal('create'); };
  const openCompteEdit = (cp: any) => {
    setCompteForm({
      produitId: String(cp.produitId ?? cp.produit?.id ?? ''),
      solde: String(cp.solde ?? 0),
      statut: cp.statut ?? 'actif',
      dateOuverture: cp.dateOuverture ?? cp.date_ouverture ?? new Date().toISOString().split('T')[0],
    });
    setCompteErrors({});
    setCompteModal({ id: cp.id });
  };

  const handleCompteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validateCompteForm(compteForm);
    if (fieldErrors) { setCompteErrors(fieldErrors); toast.error(Object.values(fieldErrors)[0]); return; }
    setCompteErrors({});
    setSavingCompte(true);
    try {
      if (compteModal === 'create') {
        await clientService.createCompte(id, {
          produitId: Number(compteForm.produitId),
          soldeInitial: parseFloat(compteForm.solde) || 0,
          statut: compteForm.statut,
          dateOuverture: compteForm.dateOuverture,
        });
        toast.success('Compte créé');
      } else if (compteModal && typeof compteModal === 'object') {
        await compteService.update(compteModal.id, {
          statut: compteForm.statut,
          dateOuverture: compteForm.dateOuverture,
        });
        toast.success('Compte mis à jour');
      }
      setCompteModal(null);
      await loadComptes();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur');
    } finally {
      setSavingCompte(false);
    }
  };

  const handleCompteDelete = async (cpId: number | string) => {
    try {
      await compteService.remove(cpId);
      toast.success('Compte supprimé');
      setConfirmCompteId(null);
      await loadComptes();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la suppression');
    }
  };

  // ── Transaction handler ──
  const handleTransaction = async () => {
    if (!txModal) return;
    const montant = parseFloat(txForm.montant);
    if (!montant || montant <= 0) { toast.error('Montant invalide'); return; }
    if (txModal.statut !== 'actif') { toast.error('Ce compte est suspendu ou clos'); return; }
    if (txForm.type === 'debit' && montant > (txModal.solde ?? 0)) {
      toast.error(`Solde insuffisant (${formatCurrency(txModal.solde)} disponible)`); return;
    }
    setSavingTx(true);
    try {
      const payload = { montant, description: txForm.motif };
      if (txForm.type === 'credit') {
        await compteService.depot(txModal.id, payload);
      } else {
        await compteService.retrait(txModal.id, payload);
      }
      toast.success('Transaction enregistrée');
      setTxModal(null);
      setTxForm({ type: 'credit', montant: '', motif: '' });
      await loadComptes();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la transaction');
    } finally {
      setSavingTx(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/dashboard/marketing/clients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold shrink-0">
            {client.typePersonne === 'morale' ? client.nom?.[0] : <>{client.prenom?.[0]}{client.nom?.[0]}</>}
          </div>
          <div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <h1 className="text-2xl font-bold">{client.typePersonne === 'morale' ? client.nom : `${client.prenom ?? ''} ${client.nom}`}</h1>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-600">
                {client.typePersonne === 'morale' ? 'Entreprise' : 'Particulier'}
              </span>
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold', STATUT_CLIENT_COLOR[client.statut] ?? 'bg-muted text-muted-foreground')}>
                {client.statut === 'actif' ? 'Actif' : client.statut === 'inactif' ? 'Inactif' : 'Blacklisté'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Client depuis le {new Date(client.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/marketing/clients/${id}/modifier`)}>
          <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier la fiche
        </Button>
      </div>

      {/* ── Solde total rapide ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-brand-50 border-brand-100">
          <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Solde total (comptes actifs)</p>
          <p className="text-2xl font-black text-brand-700 mt-1">{formatCurrency(soldeTotalActif)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nombre de comptes</p>
          <p className="text-2xl font-black mt-1">{comptes.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transactions récentes</p>
          <p className="text-2xl font-black mt-1">{totalTxCount}</p>
        </Card>
      </div>

      {/* ── Infos en 2 colonnes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Identité & Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(client.typePersonne === 'morale' ? [
              { icon: Shield, label: 'Sigle',            value: client.sigle },
              { icon: Shield, label: 'Forme juridique',  value: client.formeJuridique },
              { icon: Shield, label: 'N° RCCM',          value: client.rccm },
              { icon: Shield, label: 'NUI',              value: client.nui },
              { icon: Users,  label: 'Créée le',         value: client.dateNaissance ? new Date(client.dateNaissance).toLocaleDateString('fr-FR') : undefined },
              { icon: Shield, label: 'Capital social',   value: client.capitalSocial },
              { icon: Phone,  label: 'Téléphone',        value: client.telephone },
              { icon: Phone,  label: 'Tél. secondaire',  value: client.telephoneSecondaire },
              { icon: Mail,   label: 'Email',            value: client.email },
            ] : [
              { icon: Shield, label: 'CNI',             value: client.numeroCni ?? client.numeroCNI },
              { icon: Shield, label: 'NUI',              value: client.nui },
              { icon: Users,  label: 'Genre',            value: client.genre === 'M' ? 'Masculin' : client.genre === 'F' ? 'Féminin' : undefined },
              { icon: Users,  label: 'Né(e) le',         value: client.dateNaissance ? new Date(client.dateNaissance).toLocaleDateString('fr-FR') : undefined },
              { icon: MapPin, label: 'Lieu de naissance',value: client.lieuNaissance },
              { icon: Shield, label: 'Nationalité',      value: client.nationalite },
              { icon: Phone,  label: 'Téléphone',        value: client.telephone },
              { icon: Phone,  label: 'Tél. secondaire',  value: client.telephoneSecondaire },
              { icon: Mail,   label: 'Email',            value: client.email },
              { icon: Users,  label: 'Situation',        value: client.situationFamiliale ? SituationLabel[client.situationFamiliale] : undefined },
              { icon: Users,  label: 'Enfants',          value: client.nombreEnfants != null ? String(client.nombreEnfants) : undefined },
            ]).filter((r) => r.value).map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right">{value}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Adresse & Situation professionnelle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { icon: MapPin,    label: 'Adresse',       value: client.adresse },
              { icon: MapPin,    label: 'Quartier',       value: client.quartier },
              { icon: MapPin,    label: 'Ville',          value: client.ville },
              ...(client.typePersonne === 'morale' ? [] : [
                { icon: Briefcase, label: 'Profession',     value: client.profession },
                { icon: Briefcase, label: 'Employeur',      value: client.employeur },
              ]),
              { icon: Briefcase, label: 'Secteur',        value: client.secteurActivite },
              { icon: Briefcase, label: client.typePersonne === 'morale' ? "Chiffre d'affaires" : 'Revenu mensuel', value: client.revenuMensuel },
              { icon: Users,     label: client.typePersonne === 'morale' ? 'Représentant légal' : 'Référent', value: client.referentNom ? `${client.referentNom}${client.referentRelation ? ` (${client.referentRelation})` : ''}` : undefined },
              { icon: Phone,     label: client.typePersonne === 'morale' ? 'Tél. représentant' : 'Tél. référent', value: client.referentTelephone },
              { icon: BookOpen,  label: 'Agence',         value: agenceNom },
              { icon: Users,     label: 'Commercial',     value: commercialNom },
            ].filter((r) => r.value && r.value !== '—').map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right">{value}</span>
                </div>
              </div>
            ))}
            {client.notes && (
              <div className="pt-2 mt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase">Notes</p>
                <p className="text-sm text-foreground/80">{client.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Comptes ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold">Comptes ({comptes.length})</h2>
          <Button variant="brand" size="sm" onClick={openCompteCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau compte
          </Button>
        </div>

        {comptes.length === 0 && (
          <Card className="py-12 text-center text-muted-foreground text-sm">Aucun compte pour ce client.</Card>
        )}

        {comptes.map((cp) => {
          const txList = recentTx[String(cp.id)] ?? [];
          return (
            <Card key={cp.id} className="overflow-hidden">
              <div className="flex flex-col gap-3 px-5 py-4 border-b bg-muted/20 sm:flex-row sm:items-center">
                <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <p className="font-mono font-bold text-sm">{cp.numero}</p>
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold w-fit', STATUT_COMPTE_COLOR[cp.statut] ?? 'bg-muted text-muted-foreground')}>
                      {cp.statut === 'actif' ? 'Actif' : cp.statut === 'suspendu' ? 'Suspendu' : 'Clos'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {getProduitNom(cp.produitId ?? cp.produit?.id)} · ouvert le {new Date(cp.dateOuverture ?? cp.date_ouverture).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black">{formatCurrency(cp.solde ?? 0)}</p>
                  <p className="text-[11px] text-muted-foreground">solde actuel</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto justify-end sm:justify-start" onClick={(e) => e.stopPropagation()}>
                  {cp.statut === 'actif' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-brand-600 border-brand-200 hover:bg-brand-50"
                      onClick={() => { setTxModal(cp); setTxForm({ type: 'credit', montant: '', motif: '' }); }}>
                      <ArrowLeftRight className="h-3 w-3" /> Transaction
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => router.push(`/dashboard/marketing/transactions?compteId=${cp.id}`)}>
                    <ArrowLeftRight className="h-3 w-3" /> Historique
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openCompteEdit(cp)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {canDelete && (confirmCompteId === cp.id ? (
                    <>
                      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleCompteDelete(cp.id)}>
                        <Check className="mr-1 h-3 w-3" /> Confirmer
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmCompteId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setConfirmCompteId(cp.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ))}
                </div>
              </div>

              {txList.length > 0 && (
                <div className="divide-y divide-border/50">
                  {txList.map((tx: any) => (
                    <div key={tx.id} className="flex items-center gap-3 px-5 py-2.5">
                      <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0', tx.type === 'credit' ? 'bg-emerald-50' : 'bg-red-50')}>
                        {tx.type === 'credit'
                          ? <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                          : <ArrowDownCircle className="h-4 w-4 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{tx.motif ?? tx.description ?? 'Sans motif'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <p className={cn('text-sm font-bold shrink-0', tx.type === 'credit' ? 'text-emerald-600' : 'text-red-500')}>
                        {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.montant)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Modal Compte ── */}
      {compteModal !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-bold">{compteModal === 'create' ? 'Nouveau compte' : 'Modifier le compte'}</h2>
              <Button variant="ghost" size="icon" onClick={() => setCompteModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleCompteSubmit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label>Produit <span className="text-red-500">*</span></Label>
                <Select
                  value={compteForm.produitId || '__none__'}
                  onValueChange={(v) => setCompteForm({ ...compteForm, produitId: v === '__none__' ? '' : v })}
                  disabled={typeof compteModal === 'object'}
                >
                  <SelectTrigger><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {produits.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
                {compteErrors.produitId && <p className="text-xs text-red-500">{compteErrors.produitId}</p>}
              </div>
              {compteModal === 'create' && (
                <div className="space-y-1.5">
                  <Label>Solde initial (FCFA)</Label>
                  <Input type="number" min="0" value={compteForm.solde} onChange={(e) => setCompteForm({ ...compteForm, solde: e.target.value })} />
                  {compteErrors.solde && <p className="text-xs text-red-500">{compteErrors.solde}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select value={compteForm.statut} onValueChange={(v) => setCompteForm({ ...compteForm, statut: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actif">Actif</SelectItem>
                      <SelectItem value="suspendu">Suspendu</SelectItem>
                      <SelectItem value="clos">Clos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date d'ouverture</Label>
                  <Input type="date" value={compteForm.dateOuverture} onChange={(e) => setCompteForm({ ...compteForm, dateOuverture: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setCompteModal(null)}>Annuler</Button>
                <Button type="submit" variant="brand" disabled={savingCompte}>Enregistrer</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Transaction rapide ── */}
      {txModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h3 className="font-bold">Nouvelle transaction</h3>
                <p className="text-xs text-muted-foreground">
                  {txModal.numero} · Solde : <span className="font-semibold">{formatCurrency(txModal.solde ?? 0)}</span>
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setTxModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex rounded-lg border overflow-hidden">
                {(['credit', 'debit'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTxForm({ ...txForm, type: t })}
                    className={cn('flex-1 py-2.5 text-sm font-bold transition-colors',
                      txForm.type === t
                        ? t === 'credit' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}>
                    {t === 'credit' ? '+ Crédit' : '− Débit'}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Montant (FCFA) <span className="text-red-500">*</span></Label>
                <Input
                  type="number" min="1"
                  value={txForm.montant}
                  onChange={(e) => setTxForm({ ...txForm, montant: e.target.value })}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Motif</Label>
                <Input value={txForm.motif} onChange={(e) => setTxForm({ ...txForm, motif: e.target.value })} placeholder="Versement, retrait…" />
              </div>
              {txForm.type === 'debit' && txForm.montant && parseFloat(txForm.montant) > (txModal.solde ?? 0) && (
                <p className="text-xs text-red-500 font-medium">Solde insuffisant — maximum {formatCurrency(txModal.solde)}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setTxModal(null)}>Annuler</Button>
                <Button variant="brand" onClick={handleTransaction} disabled={savingTx}>Enregistrer</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
