'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useAuthStore } from '@/stores/useAuthStore';
import { authService } from '@/services/authService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Lock, Eye, EyeOff, X, Building2, UsersRound, CalendarDays, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur', manager: 'Manager',
  backoffice: 'Back-office', agent: 'Agent terrain',
};
const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 border-red-200',
  manager: 'bg-violet-100 text-violet-700 border-violet-200',
  backoffice: 'bg-blue-100 text-blue-700 border-blue-200',
  agent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const profilSchema = z.object({
  fonction: z.string().trim().max(150, 'Maximum 150 caractères').optional(),
});

const pwdSchema = z.object({
  current: z.string().min(1, 'Mot de passe actuel requis'),
  next: z.string().min(6, 'Le nouveau mot de passe doit contenir au moins 6 caractères'),
  confirm: z.string(),
}).refine((d) => d.next === d.confirm, { message: 'Les mots de passe ne correspondent pas', path: ['confirm'] });

export default function ProfilPage() {
  const { user, setUser } = useAuthStore();

  const roleSlug = typeof user?.role === 'string' ? user.role : (user?.role as any)?.slug ?? 'agent';

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ fonction: user?.fonction ?? '' });
  const [saving, setSaving] = useState(false);

  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);

  if (!user) return (
    <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
      Profil introuvable.
    </div>
  );

  const handleUpdateProfil = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = profilSchema.safeParse(form);
    if (!result.success) { toast.error(result.error.issues[0].message); return; }
    setSaving(true);
    try {
      const updated = await authService.updateMe({ fonction: form.fonction });
      setUser(updated);
      toast.success('Profil mis à jour');
      setEditMode(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = pwdSchema.safeParse(pwdForm);
    if (!result.success) { toast.error(result.error.issues[0].message); return; }
    setPwdSaving(true);
    try {
      await authService.changePassword({
        current_password: pwdForm.current,
        new_password: pwdForm.next,
        new_password_confirmation: pwdForm.confirm,
      });
      toast.success('Mot de passe mis à jour');
      setShowPwdModal(false);
      setPwdForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Mot de passe actuel incorrect');
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Mon Profil</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Vos informations personnelles et sécurité du compte.</p>
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-3">
        {/* Carte identité */}
        <Card className="sm:col-span-1 flex flex-col items-center text-center p-4 sm:p-6 gap-4">
          <div
            className="h-16 w-16 sm:h-20 sm:w-20 rounded-full flex items-center justify-center text-xl sm:text-2xl font-black text-white shadow-lg shrink-0"
            style={{ background: 'linear-gradient(135deg, #c47d0e, #b8860b)' }}
          >
            {user.prenom?.[0]}{user.nom?.[0]}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-base sm:text-lg leading-tight break-words">{user.prenom} {user.nom}</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-all">{user.email}</p>
          </div>
          <div className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border uppercase tracking-widest',
            ROLE_COLORS[roleSlug] ?? 'bg-gray-100 text-gray-600 border-gray-200'
          )}>
            {ROLE_LABELS[roleSlug] ?? roleSlug}
          </div>
          <Badge variant={user.actif !== false ? 'success' : 'outline'}>{user.actif !== false ? 'Actif' : 'Suspendu'}</Badge>

          <Separator />

          <div className="w-full space-y-2.5 text-left text-sm">
            {(user as any).agence && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{(user as any).agence.nom}</span>
              </div>
            )}
            {(user as any).equipe && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <UsersRound className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{(user as any).equipe.nom}</span>
              </div>
            )}
            {user.fonction && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{user.fonction}</span>
              </div>
            )}
            {user.created_at && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">
                  Depuis {new Date(user.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Colonne droite */}
        <div className="sm:col-span-2 space-y-4 sm:space-y-6">
          {/* Infos modifiables */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Informations</CardTitle>
                {!editMode && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setForm({ fonction: user.fonction ?? '' }); setEditMode(true); }}>
                    Modifier
                  </Button>
                )}
              </div>
              <CardDescription>Nom et prénom gérés par l'administrateur. Vous pouvez modifier votre fonction.</CardDescription>
            </CardHeader>
            <CardContent>
              {!editMode ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-x-6 sm:gap-y-3 text-xs sm:text-sm">
                  {[
                    ['Prénom', user.prenom], ['Nom', user.nom],
                    ['Email', user.email], ['Fonction', user.fonction || '—'],
                    ['Agence', (user as any).agence?.nom ?? '—'], ['Équipe', (user as any).equipe?.nom ?? '—'],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{l}</dt>
                      <dd className="font-semibold mt-0.5 text-xs sm:text-sm break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <form onSubmit={handleUpdateProfil} className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Prénom</Label>
                      <Input value={user.prenom} disabled className="bg-muted/40 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nom</Label>
                      <Input value={user.nom} disabled className="bg-muted/40 text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fonction</Label>
                    <Input
                      value={form.fonction}
                      onChange={(e) => setForm({ ...form, fonction: e.target.value })}
                      placeholder="ex: Agent de collecte"
                      className="text-xs"
                    />
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 sm:pt-4 border-t w-full">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditMode(false)} className="w-full sm:w-auto">Annuler</Button>
                    <Button type="submit" variant="brand" size="sm" loading={saving} className="w-full sm:w-auto">Enregistrer</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Sécurité */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sécurité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3 rounded-lg bg-muted/40">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs sm:text-sm font-medium">Mot de passe</span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs w-full sm:w-auto" onClick={() => { setShowPwdModal(true); setPwdForm({ current: '', next: '', confirm: '' }); }}>
                  Changer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal mot de passe */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between border-b p-3 sm:p-4">
              <h2 className="font-bold text-sm sm:text-base">Changer le mot de passe</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowPwdModal(false)} className="h-8 w-8"><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleChangePwd} className="p-3 sm:p-5 space-y-3 sm:space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Mot de passe actuel <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={pwdForm.current}
                    onChange={(e) => setPwdForm({ ...pwdForm, current: e.target.value })}
                    placeholder="••••••••"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd((v) => !v)}>
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nouveau mot de passe <span className="text-red-500">*</span></Label>
                <Input type="password" value={pwdForm.next} onChange={(e) => setPwdForm({ ...pwdForm, next: e.target.value })} placeholder="Min. 6 caractères" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Confirmer <span className="text-red-500">*</span></Label>
                <Input type="password" value={pwdForm.confirm} onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })} placeholder="••••••••" />
                {pwdForm.confirm && pwdForm.next !== pwdForm.confirm && (
                  <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
                )}
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 sm:pt-4 border-t w-full">
                <Button type="button" variant="ghost" onClick={() => setShowPwdModal(false)} className="w-full sm:w-auto">Annuler</Button>
                <Button type="submit" variant="brand" loading={pwdSaving} className="w-full sm:w-auto">Enregistrer</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
