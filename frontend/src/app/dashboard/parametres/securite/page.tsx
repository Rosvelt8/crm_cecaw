'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi } from '@/components/ui/kpi';
import { securiteApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDateTime } from '@/lib/utils';

const taille = (o: number) => (o > 1e9 ? `${(o / 1e9).toFixed(1)} Go` : o > 1e6 ? `${(o / 1e6).toFixed(1)} Mo` : `${Math.round(o / 1e3)} Ko`);

export default function SecuritePage() {
  const { can } = useCan();
  const modif = can('securite:CONFIGURE');
  const [etat, setEtat] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [sauv, setSauv] = useState<any[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try { const [e, u, s] = await Promise.all([securiteApi.etat(), securiteApi.utilisateurs(), securiteApi.sauvegardes()]); setEtat(e); setUsers(u); setSauv(s); setErreur(null); }
    catch (x) { setErreur(msg(x, 'Accès refusé')); }
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  const agir = async (fn: () => Promise<unknown>, ok: string) => { setOccupe(true); try { await fn(); toast.success(ok); await charger(); } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); } };

  if (erreur) return <p className="text-destructive">{erreur}</p>;
  if (!etat) return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <EnTete titre="Sécurité" sousTitre="Double authentification, comptes bloqués, sauvegardes et reprise après incident" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Utilisateurs avec MFA" valeur={`${etat.taux_mfa_pct} %`} precision={`${etat.mfa_actifs} / ${etat.utilisateurs_actifs}`} ton={etat.taux_mfa_pct >= 80 ? 'bon' : 'alerte'} />
        <Kpi label="Comptes bloqués" valeur={etat.comptes_bloques} ton={etat.comptes_bloques ? 'alerte' : 'bon'} />
        <Kpi label="Dernière sauvegarde" valeur={etat.derniere_sauvegarde ? formatDateTime(etat.derniere_sauvegarde.date) : 'Aucune'} ton={etat.derniere_sauvegarde ? 'bon' : 'mauvais'} />
        <Kpi label="Chiffrement" valeur={etat.chiffrement_configure ? 'Configuré' : 'ABSENT'} precision={etat.sauvegarde_planifiee ? 'sauvegarde quotidienne active' : 'sauvegarde planifiée désactivée'} ton={etat.chiffrement_configure ? 'bon' : 'mauvais'} />
      </div>
      {!etat.chiffrement_configure && <p className="rounded-md border border-warning/40 bg-warning-50 p-3 text-sm text-warning-700">DATA_ENCRYPTION_KEY n'est pas défini : les sauvegardes ne peuvent pas être chiffrées et, hors développement, l'activation de la MFA échouera. Voir docs/RUNBOOK_REPRISE.md.</p>}

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0"><CardTitle className="text-base">Sauvegardes</CardTitle>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={occupe} onClick={() => agir(async () => { const r = await securiteApi.verifierSauvegardes(); setSauv(r); if (r.some((x: any) => !x.integre)) throw new Error('Au moins une sauvegarde est altérée'); }, 'Toutes les sauvegardes sont intègres')}>Vérifier l'intégrité</Button>
            {modif && <Button size="sm" variant="brand" disabled={occupe} onClick={() => agir(() => securiteApi.sauvegarder(), 'Sauvegarde réalisée')}>Sauvegarder maintenant</Button>}</div></CardHeader>
        <CardContent className="space-y-1.5">
          {sauv.length === 0 && <p className="text-sm text-muted-foreground">Aucune sauvegarde.</p>}
          {sauv.map((s) => <div key={s.fichier} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b last:border-0 pb-1.5"><span>{s.fichier}</span><span className="text-xs text-muted-foreground">{formatDateTime(s.date)} · {taille(s.taille)} · {s.chiffree ? 'chiffrée' : 'non chiffrée'} · {s.sha256.slice(0, 10)}…{s.integre === false && <Badge variant="destructive" className="ml-2">ALTÉRÉE</Badge>}{s.integre === true && <Badge variant="success" className="ml-2">intègre</Badge>}</span></div>)}
          <p className="text-xs text-muted-foreground pt-2">La restauration se fait volontairement, en ligne de commande : <code>npm run db:restore -- &lt;fichier&gt;</code>.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Comptes</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Utilisateur</th><th className="px-3 py-2 text-left">MFA</th><th className="px-3 py-2 text-left">État</th><th /></tr></thead>
          <tbody>{users.map((u) => {
            const bloque = u.bloqueJusquA && new Date(u.bloqueJusquA) > new Date();
            return (<tr key={u.id} className="border-t"><td className="px-3 py-1.5">{u.prenom} {u.nom}<span className="text-xs text-muted-foreground"> {u.email}</span></td><td className="px-3 py-1.5"><Badge variant={u.mfaActif ? 'success' : 'outline'}>{u.mfaActif ? 'Active' : 'Non'}</Badge></td>
              <td className="px-3 py-1.5">{!u.actif ? <Badge variant="secondary">Suspendu</Badge> : bloque ? <Badge variant="destructive">Bloqué jusqu'à {formatDateTime(u.bloqueJusquA)}</Badge> : u.tentativesEchouees > 0 ? <Badge variant="warning">{u.tentativesEchouees} échec(s)</Badge> : <Badge variant="success">Normal</Badge>}</td>
              <td className="px-3 py-1.5 text-right space-x-1">{modif && bloque && <Button size="sm" variant="outline" onClick={() => agir(() => securiteApi.debloquer(u.id), 'Compte débloqué')}>Débloquer</Button>}{modif && u.mfaActif && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Réinitialiser la MFA de ${u.prenom} ${u.nom} ?`)) void agir(() => securiteApi.reinitialiserMfa(u.id), 'MFA réinitialisée'); }}>Réinitialiser MFA</Button>}</td></tr>);
          })}</tbody></table></CardContent>
      </Card>
    </div>
  );
}
