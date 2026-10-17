'use client';

import Link from 'next/link';
import {
  Banknote, Briefcase, Building2, Camera, Clock, ExternalLink, Eye, FileText, Gauge, MapPin, Navigation, Phone, Route, Signature, User, Users,
} from 'lucide-react';
import { Pictogramme } from './PinCarte';
import type { ActionCarte, IconeAction, IconeCarte, IconeInfo, PopupCarte as Popup, TonCarte } from './types';

const ICONES_INFO: Record<IconeInfo, typeof MapPin> = {
  telephone: Phone, adresse: MapPin, heure: Clock, montant: Banknote, personne: User, agence: Building2, distance: Route,
  document: FileText, photo: Camera, signature: Signature, priorite: Gauge, activite: Briefcase, zone: Users,
};
const ICONES_ACTION: Record<IconeAction, typeof MapPin> = { voir: Eye, itineraire: Navigation, appeler: Phone, tournee: Route, fiche: ExternalLink };
const TONS: Record<TonCarte, string> = {
  bon: 'bg-emerald-100 text-emerald-800', alerte: 'bg-amber-100 text-amber-800', mauvais: 'bg-red-100 text-red-800',
  info: 'bg-sky-100 text-sky-800', neutre: 'bg-slate-100 text-slate-700',
};

function Bouton({ a }: { a: ActionCarte }) {
  const Icone = ICONES_ACTION[a.icone ?? (a.externe ? 'fiche' : 'voir')];
  const classe = a.principale
    ? 'bg-brand-600 text-white hover:bg-brand-700'
    : 'border bg-white text-slate-900 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
  const contenu = <><Icone className="h-3.5 w-3.5 shrink-0" />{a.label}</>;
  const base = `inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors no-underline ${classe}`;
  return a.externe || a.href.startsWith('tel:') || a.href.startsWith('http')
    ? <a href={a.href} target={a.href.startsWith('tel:') ? undefined : '_blank'} rel="noopener noreferrer" className={base}>{contenu}</a>
    : <Link href={a.href} className={base}>{contenu}</Link>;
}

/**
 * Fenêtre d'information d'un point ou d'une zone : bandeau coloré avec pictogramme, badges d'état, lignes d'information
 * illustrées, et boutons vers les pages de référence (fiche, tournée…) ou vers un itinéraire externe.
 */
export function PopupCarte({ popup, couleur, icone }: { popup: Popup; couleur: string; icone?: IconeCarte }) {
  return (
    <div className="w-[300px] overflow-hidden rounded-xl border border-black/10 bg-white text-slate-900 shadow-xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-center gap-3 px-3.5 py-3 text-white" style={{ background: `linear-gradient(135deg, ${couleur}, ${couleur}dd)` }}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/25"><Pictogramme icone={icone} size={20} strokeWidth={2.2} /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{popup.titre}</p>
          {popup.sousTitre && <p className="truncate text-[11px] opacity-90">{popup.sousTitre}</p>}
        </div>
      </div>
      <div className="space-y-2.5 px-3.5 py-3">
        {popup.badges && popup.badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{popup.badges.map((b) => <span key={b.label} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONS[b.ton ?? 'neutre']}`}>{b.label}</span>)}</div>
        )}
        {popup.infos && popup.infos.length > 0 && (
          <dl className="space-y-1.5">
            {popup.infos.map((i) => {
              const I = ICONES_INFO[i.icone ?? 'adresse'];
              return (
                <div key={`${i.label}-${i.valeur}`} className="flex items-start gap-2 text-xs">
                  <I className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <dt className="shrink-0 text-muted-foreground">{i.label}</dt>
                  <dd className="min-w-0 flex-1 break-words text-right font-medium">{i.valeur}</dd>
                </div>
              );
            })}
          </dl>
        )}
        {popup.texte && <p className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs leading-snug text-slate-600 dark:bg-slate-800 dark:text-slate-300">{popup.texte}</p>}
        {popup.actions && popup.actions.length > 0 && <div className="flex flex-wrap gap-2 pt-0.5">{popup.actions.map((a) => <Bouton key={`${a.label}-${a.href}`} a={a} />)}</div>}
      </div>
    </div>
  );
}
