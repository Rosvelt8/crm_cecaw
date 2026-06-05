'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, UserPlus, Shield, MoreVertical, CheckCircle2, XCircle, Mail, Building2, X, Edit2, RefreshCw, KeyRound } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ROLE_LABELS, ROLE_COLORS } from '@/constants';
import { cn } from '@/lib/utils';
import type { User, BackendRole } from '@/types/user';
import { userService } from '@/services/userService';
import { toast } from 'sonner';

const BACKEND_ROLES: BackendRole[] = ['admin', 'manager', 'backoffice', 'agent'];

interface UserForm {
  nom: string;
  prenom: string;
  email: string;
  role: BackendRole;
  agence_id: number | '';
  equipe_id?: number | '';
  fonction: string;
}

const EMPTY_FORM: UserForm = { nom: '', prenom: '', email: '', role: 'agent', agence_id: '', fonction: '' };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [agences, setAgences] = useState<{ id: number; nom: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statutFilter, setStatutFilter] = useState('all');

  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, agencesData] = await Promise.all([
        userService.getUsers({ per_page: 100 }),
        userService.getAgences(),
      ]);
      setUsers(usersRes.data);
      setAgences(agencesData);
    } catch {
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch = !q ||
        u.nom.toLowerCase().includes(q) ||
        u.prenom.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.agence?.nom ?? '').toLowerCase().includes(q);
      const roleSlug = (u.role?.slug ?? '') as string;
      const matchRole = roleFilter === 'all' || roleSlug === roleFilter;
      const matchStatut = statutFilter === 'all' ||
        (statutFilter === 'actif' && u.actif !== false) ||
        (statutFilter === 'inactif' && u.actif === false);
      return matchSearch && matchRole && matchStatut;
    });
  }, [users, search, roleFilter, statutFilter]);

  const openCreate = () => {
    setEditUser(null);
    setUserForm(EMPTY_FORM);
    setShowUserModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setUserForm({
      nom:       u.nom,
      prenom:    u.prenom,
      email:     u.email,
      role:      (u.roleString ?? u.role?.slug ?? 'agent') as BackendRole,
      agence_id: u.agence_id ?? '',
      fonction:  u.fonction ?? '',
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.nom.trim() || !userForm.prenom.trim() || !userForm.email.trim()) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    setSaving(true);
    try {
      if (editUser) {
        const updated = await userService.update(editUser.id, {
          nom:       userForm.nom,
          prenom:    userForm.prenom,
          email:     userForm.email,
          role:      userForm.role,
          agence_id: userForm.agence_id ? Number(userForm.agence_id) : undefined,
          fonction:  userForm.fonction,
        });
        setUsers((prev) => prev.map((u) => (u.id === editUser.id ? updated : u)));
        toast.success('Utilisateur mis à jour');
      } else {
        if (!userForm.agence_id) { toast.error('Agence requise'); setSaving(false); return; }
        const res = await userService.create({
          nom:       userForm.nom,
          prenom:    userForm.prenom,
          email:     userForm.email,
          role:      userForm.role,
          agence_id: Number(userForm.agence_id),
          fonction:  userForm.fonction,
        });
        toast.success(`Utilisateur créé — mot de passe initial : ${res.mot_de_passe_initial ?? 'Cecaw2025!'}`);
        await load();
      }
      setShowUserModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (u: User) => {
    try {
      await userService.toggle(u.id);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, actif: !x.actif, statut: x.actif ? 'suspendu' : 'actif' } : x));
      toast.info(`Accès ${u.actif ? 'suspendu' : 'réactivé'}`);
    } catch { toast.error('Erreur lors de la modification'); }
  };

  const handleResetPassword = async (u: User) => {
    try {
      const result = await userService.resetPassword(u.id);
      toast.success(`Mot de passe réinitialisé : ${result}`);
    } catch { toast.error('Erreur lors de la réinitialisation'); }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Supprimer ${u.prenom} ${u.nom} ?`)) return;
    try {
      await userService.remove(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast.success('Utilisateur supprimé');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Impossible de supprimer cet utilisateur');
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Utilisateurs & Rôles</h1>
          <p className="text-muted-foreground">Gérez les accès et permissions des collaborateurs CECAW.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Actualiser
          </Button>
          <Button variant="brand" onClick={openCreate}>
            <UserPlus className="mr-2 h-4 w-4" /> Nouvel Utilisateur
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-success-50 text-success-600 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Utilisateurs actifs</p>
            <p className="text-2xl font-bold">{users.filter((u) => u.actif !== false).length}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Agences représentées</p>
            <p className="text-2xl font-bold">{new Set(users.map((u) => u.agence?.id)).size}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-warning-50 text-warning-600 flex items-center justify-center">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Rôles distincts</p>
            <p className="text-2xl font-bold">{new Set(users.map((u) => u.role?.slug)).size}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Input placeholder="Nom, email, agence..." value={search} onChange={(e) => setSearch(e.target.value)} icon={<Search className="h-4 w-4" />} />
            </div>
            <div className="flex items-center gap-2">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Rôle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rôles</SelectItem>
                  {BACKEND_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statutFilter} onValueChange={setStatutFilter}>
                <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Statut" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="actif">Actif</SelectItem>
                  <SelectItem value="inactif">Suspendu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Fonction</TableHead>
                <TableHead>Agence</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Chargement…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Aucun utilisateur trouvé.</TableCell></TableRow>
              ) : (
                filtered.map((user) => {
                  const roleSlug = (user.role?.slug ?? '') as string;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground">
                            {user.prenom[0]}{user.nom[0]}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{user.prenom} {user.nom}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {user.email}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border', (ROLE_COLORS as any)[roleSlug] ?? 'bg-gray-100 text-gray-700')}>
                          {(ROLE_LABELS as any)[roleSlug] ?? roleSlug}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{user.fonction ?? '—'}</TableCell>
                      <TableCell className="text-xs font-medium">{user.agence?.nom ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={user.actif !== false ? 'success' : 'destructive'}>
                          {user.actif !== false ? 'Actif' : 'Suspendu'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(user)}>
                              <Edit2 className="mr-2 h-4 w-4" /> Modifier le profil
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                              <KeyRound className="mr-2 h-4 w-4" /> Réinitialiser mdp
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className={user.actif !== false ? 'text-amber-600' : 'text-green-600'}
                              onClick={() => handleToggle(user)}
                            >
                              {user.actif !== false ? 'Suspendre l\'accès' : 'Activer l\'accès'}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(user)}>
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal Créer / Modifier Utilisateur */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg animate-in zoom-in-95">
            <div className="border-b p-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{editUser ? 'Modifier l\'utilisateur' : 'Nouvel Utilisateur'}</h2>
                <p className="text-xs text-muted-foreground">
                  {editUser ? `${editUser.prenom} ${editUser.nom}` : 'Créer un accès collaborateur CECAW'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowUserModal(false)}><X className="h-5 w-5" /></Button>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prénom <span className="text-red-500">*</span></Label>
                  <Input required value={userForm.prenom} onChange={(e) => setUserForm({ ...userForm, prenom: e.target.value })} placeholder="Ex : Jean" />
                </div>
                <div className="space-y-2">
                  <Label>Nom <span className="text-red-500">*</span></Label>
                  <Input required value={userForm.nom} onChange={(e) => setUserForm({ ...userForm, nom: e.target.value })} placeholder="Ex : Mvondo" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email professionnel <span className="text-red-500">*</span></Label>
                <Input required type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="prenom.nom@cecaw.cm" />
              </div>
              <div className="space-y-2">
                <Label>Fonction</Label>
                <Input value={userForm.fonction} onChange={(e) => setUserForm({ ...userForm, fonction: e.target.value })} placeholder="Ex : Chargé de clientèle" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rôle</Label>
                  <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v as BackendRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BACKEND_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Agence {!editUser && <span className="text-red-500">*</span>}</Label>
                  <Select value={String(userForm.agence_id)} onValueChange={(v) => setUserForm({ ...userForm, agence_id: Number(v) })}>
                    <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      {agences.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setShowUserModal(false)}>Annuler</Button>
                <Button type="submit" variant="brand" loading={saving}>
                  {editUser ? 'Enregistrer les modifications' : 'Créer l\'utilisateur'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
