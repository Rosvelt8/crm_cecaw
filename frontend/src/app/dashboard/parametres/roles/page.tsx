'use client';
/* eslint-disable react/no-unescaped-entities -- texte français : les apostrophes sont légitimes dans le JSX */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { adminService, type PermissionRef, type RoleRef } from '@/services/adminService';
import { userService } from '@/services/userService';
import { useCan } from '@/hooks/useCan';
import { cn } from '@/lib/utils';

const message = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;

export default function RolesPage() {
  const { can } = useCan();
  const peutModifier = can('securite:CONFIGURE');
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [permissions, setPermissions] = useState<PermissionRef[]>([]);
  const [regles, setRegles] = useState<Awaited<ReturnType<typeof adminService.reglesSeparation>>>([]);
  const [choisi, setChoisi] = useState<RoleRef | null>(null);
  const [droits, setDroits] = useState<Set<string>>(new Set());
  const [sale, setSale] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Affectation des rôles à un utilisateur
  const [utilisateurs, setUtilisateurs] = useState<{ id: number; nom: string; prenom: string; role?: string }[]>([]);
  const [utilisateurId, setUtilisateurId] = useState('');
  const [rolesUtilisateur, setRolesUtilisateur] = useState<Set<string>>(new Set());
  const [rolesSales, setRolesSales] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [r, p, s] = await Promise.all([adminService.roles(), adminService.permissions(), adminService.reglesSeparation()]);
      setRoles(r); setPermissions(p); setRegles(s); setErreur(null);
    } catch (e) { setErreur(message(e, 'Accès refusé ou référentiel non initialisé')); }
    finally { setChargement(false); }
  }, []);
  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => {
    if (peutModifier) userService.getAllUsers().then((r: { id: number; nom: string; prenom: string }[]) => setUtilisateurs(r)).catch(() => {});
  }, [peutModifier]);

  const choisirUtilisateur = async (id: string) => {
    setUtilisateurId(id); setRolesSales(false);
    if (!id) { setRolesUtilisateur(new Set()); return; }
    try { setRolesUtilisateur(new Set((await adminService.rolesUtilisateur(Number(id))).map((r) => r.code))); }
    catch (e) { toast.error(message(e, 'Rôles indisponibles')); }
  };

  const enregistrerRolesUtilisateur = async () => {
    try { await adminService.definirRolesUtilisateur(Number(utilisateurId), [...rolesUtilisateur]); toast.success('Rôles enregistrés'); setRolesSales(false); await charger(); }
    catch (e) { toast.error(message(e, 'Affectation impossible')); }
  };

  const choisir = (r: RoleRef) => { setChoisi(r); setDroits(new Set(r.droits)); setSale(false); };

  const domaines = useMemo(() => {
    const m = new Map<string, PermissionRef[]>();
    permissions.forEach((p) => m.set(p.domaine, [...(m.get(p.domaine) ?? []), p]));
    return [...m.entries()];
  }, [permissions]);

  const basculer = (code: string) => {
    if (!peutModifier) return;
    setDroits((d) => { const n = new Set(d); if (n.has(code)) n.delete(code); else n.add(code); return n; });
    setSale(true);
  };

  const enregistrer = async () => {
    if (!choisi) return;
    setOccupe(true);
    try { await adminService.definirDroitsRole(choisi.id, [...droits]); toast.success(`Habilitations de ${choisi.code} enregistrées`); setSale(false); await charger(); }
    catch (e) { toast.error(message(e, 'Enregistrement impossible')); }
    finally { setOccupe(false); }
  };

  if (chargement) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;
  if (erreur) return <p className="text-destructive">{erreur}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Rôles et droits</h1>
        <p className="text-sm text-muted-foreground">Référentiel des rôles CECAW 360 et dix verbes de droit. Un utilisateur peut cumuler plusieurs rôles ; sans affectation, son ancien rôle (admin, manager, chef d'équipe, agent) continue de s'appliquer.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Rôles</CardTitle></CardHeader>
          <CardContent className="p-2 max-h-[70vh] overflow-y-auto">
            {roles.map((r) => (
              <button key={r.id} onClick={() => choisir(r)} className={cn('w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted', choisi?.id === r.id && 'bg-brand-50')}>
                <span className="flex items-center justify-between"><span className="font-medium">{r.code} · {r.nom}</span><Badge variant="outline">{r.nb_utilisateurs}</Badge></span>
                <span className="text-xs text-muted-foreground line-clamp-1">{r.droits.length} droit(s)</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {!choisi ? <p className="text-sm text-muted-foreground py-8 text-center">Sélectionnez un rôle pour consulter ses droits.</p> : (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{choisi.code} · {choisi.nom}</CardTitle>
                {peutModifier && <Button size="sm" variant="brand" disabled={!sale || occupe} onClick={enregistrer}>{occupe && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Enregistrer</Button>}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{choisi.description}</p>
                {domaines.map(([domaine, liste]) => (
                  <div key={domaine} className="rounded-md border p-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">{domaine}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {liste.map((p) => {
                        const actif = droits.has(p.code);
                        return (
                          <button key={p.code} type="button" disabled={!peutModifier} onClick={() => basculer(p.code)}
                            className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', actif ? 'bg-brand-600 text-white border-brand-600' : 'bg-background text-muted-foreground hover:bg-muted', !peutModifier && 'cursor-default')}>
                            {p.verbe}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {peutModifier && (
            <Card>
              <CardHeader><CardTitle className="text-base">Affecter des rôles à un utilisateur</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={utilisateurId} onChange={(e) => void choisirUtilisateur(e.target.value)}>
                  <option value="">Choisir un utilisateur…</option>
                  {utilisateurs.map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
                </select>
                {utilisateurId && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {roles.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                          <input type="checkbox" checked={rolesUtilisateur.has(r.code)}
                            onChange={() => { setRolesUtilisateur((s) => { const n = new Set(s); if (n.has(r.code)) n.delete(r.code); else n.add(r.code); return n; }); setRolesSales(true); }} />
                          {r.code} · {r.nom}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Aucun rôle coché : l'utilisateur retombe sur son ancien rôle. Vous ne pouvez pas modifier vos propres rôles.</p>
                    <Button size="sm" variant="brand" disabled={!rolesSales} onClick={enregistrerRolesUtilisateur}>Enregistrer les rôles</Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Règles de séparation des fonctions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {regles.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border p-2 text-sm">
                  <div><p>{r.libelle}</p><p className="text-xs text-muted-foreground">{r.etapeA} ≠ {r.etapeB}</p></div>
                  {can('conformite:CONFIGURE')
                    ? <Button size="sm" variant={r.actif ? 'outline' : 'destructive'} onClick={async () => { try { await adminService.basculerRegle(r.id, !r.actif); await charger(); } catch (e) { toast.error(message(e, 'Modification impossible')); } }}>{r.actif ? 'Active' : 'Désactivée'}</Button>
                    : <Badge variant={r.actif ? 'success' : 'destructive'}>{r.actif ? 'Active' : 'Désactivée'}</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
