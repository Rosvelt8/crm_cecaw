'use client';

import { useCallback, useEffect, useState } from 'react';
import { Phone, Calendar, FileText, AlertTriangle, Handshake, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { interactionService, type Interaction, type TypeInteraction, type CanalContact } from '@/services/interactionService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDateTime } from '@/lib/utils';

const TYPE_LABEL: Record<TypeInteraction, string> = {
  appel: 'Appel', rendez_vous: 'Rendez-vous', visite: 'Visite', reclamation: 'Réclamation', document: 'Document', engagement: 'Engagement', autre: 'Autre',
};
const TYPE_ICON: Record<TypeInteraction, typeof Phone> = {
  appel: Phone, rendez_vous: Calendar, visite: Calendar, reclamation: AlertTriangle, document: FileText, engagement: Handshake, autre: MoreHorizontal,
};
const CANAL_LABEL: Record<CanalContact, string> = { presentiel: 'Présentiel', telephone: 'Téléphone', sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', autre: 'Autre' };

/**
 * Historique des interactions (compléments stratégiques, points 2-3) : mémoire chronologique des
 * contacts, en dehors du cadre d'une tournée planifiée. `cible` porte soit `client_id` soit
 * `prospect_id`, jamais les deux.
 */
export default function ClientInteractions({ cible }: { cible: { client_id?: number; prospect_id?: number } }) {
  const { can } = useCan();
  const peutLoguer = can('crm:CREATE', 'crm:UPDATE');
  const [items, setItems] = useState<Interaction[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<TypeInteraction>('appel');
  const [canal, setCanal] = useState<CanalContact | ''>('telephone');
  const [resume, setResume] = useState('');
  const [engagement, setEngagement] = useState('');
  const [prochaineActionAt, setProchaineActionAt] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try { setItems((await interactionService.list(cible, { per_page: 50 })).data); }
    catch { setItems(null); }
  }, [cible.client_id, cible.prospect_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void charger(); }, [charger]);

  const enregistrer = async () => {
    if (!resume.trim()) { toast.error('Décrivez brièvement l\'échange'); return; }
    setEnvoi(true);
    try {
      await interactionService.creer({
        type, canal: canal || null, ...cible, resume: resume.trim(),
        engagement: engagement.trim() || null, prochaine_action_at: prochaineActionAt || null,
      });
      toast.success('Interaction enregistrée');
      setResume(''); setEngagement(''); setProchaineActionAt(''); setOuvert(false);
      await charger();
    } catch (e) { toast.error(msg(e)); } finally { setEnvoi(false); }
  };

  if (items === null && !peutLoguer) return null;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historique des interactions{items ? ` (${items.length})` : ''}</CardTitle>
        {peutLoguer && <Button size="sm" variant="outline" onClick={() => setOuvert((v) => !v)}><Plus className="h-3.5 w-3.5 mr-1" />Nouvelle</Button>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {ouvert && (
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value as TypeInteraction)}>
                {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={canal} onChange={(e) => setCanal(e.target.value as CanalContact)}>
                <option value="">Canal (optionnel)</option>
                {Object.entries(CANAL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <Textarea rows={2} placeholder="Résumé de l'échange" value={resume} onChange={(e) => setResume(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Engagement pris (optionnel)" value={engagement} onChange={(e) => setEngagement(e.target.value)} />
              <Input type="date" value={prochaineActionAt} onChange={(e) => setProchaineActionAt(e.target.value)} title="Prochaine action" />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOuvert(false)}>Annuler</Button>
              <Button size="sm" variant="brand" disabled={envoi} onClick={enregistrer}>Enregistrer</Button>
            </div>
          </div>
        )}
        {items === null && <p className="text-muted-foreground">Historique indisponible.</p>}
        {items?.length === 0 && <p className="text-muted-foreground">Aucune interaction enregistrée.</p>}
        {items?.map((it) => {
          const Icon = TYPE_ICON[it.type];
          return (
            <div key={it.id} className="flex gap-3 border-l-2 border-brand-200 pl-3 py-1">
              <Icon className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{TYPE_LABEL[it.type]}{it.canal ? ` · ${CANAL_LABEL[it.canal]}` : ''}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDateTime(it.dateInteraction)}</span>
                </div>
                <p className="text-muted-foreground">{it.resume}</p>
                {it.engagement && <p className="text-xs text-brand-700 mt-0.5">Engagement : {it.engagement}</p>}
                {it.prochaineActionAt && <p className="text-xs text-warning-700 mt-0.5">Prochaine action : {formatDateTime(it.prochaineActionAt)}</p>}
                <p className="text-[11px] text-muted-foreground mt-0.5">par {it.auteur.prenom} {it.auteur.nom}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
