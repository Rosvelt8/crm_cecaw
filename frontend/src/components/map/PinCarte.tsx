'use client';

import {
  AlertOctagon, Banknote, Briefcase, Building2, CheckCircle2, Flag, Home, Landmark, MapPin, UserCog, UserPlus, UserSquare2, Wallet,
} from 'lucide-react';
import type { IconeCarte } from './types';

const ICONES: Record<IconeCarte, typeof MapPin> = {
  agence: Building2, client: UserSquare2, prospect: UserPlus, credit: Landmark, impaye: AlertOctagon, agent: UserCog, collecte: Wallet,
  depart: Flag, visite: MapPin, activite: Briefcase, domicile: Home, arrivee: CheckCircle2, autre: Banknote,
};
export const iconeDe = (i?: IconeCarte) => ICONES[i ?? 'autre'];

/** Pictogramme d'un type de point (composant stable : évite de créer un composant pendant le rendu). */
export function Pictogramme({ icone, ...props }: { icone?: IconeCarte } & React.ComponentProps<typeof MapPin>) {
  const Cmp = ICONES[icone ?? 'autre'];
  return <Cmp {...props} />;
}

/** Les marqueurs « épingle » signalent des lieux importants ; les pastilles, les éléments nombreux. */
const EPINGLES: IconeCarte[] = ['agence', 'agent', 'depart', 'visite', 'collecte', 'arrivee'];
export const estEpingle = (i?: IconeCarte, numero?: number) => numero !== undefined || (i !== undefined && EPINGLES.includes(i));

/**
 * Marqueur de carte en SVG : épingle (avec pointe) ou pastille, pictogramme ou numéro d'ordre au centre,
 * halo animé pour ce qui est en activité. La pointe de l'épingle est l'ancre : le marqueur s'ancre « en bas ».
 */
export function PinCarte({ couleur, icone, numero, pulse, actif }: { couleur: string; icone?: IconeCarte; numero?: number; pulse?: boolean; actif?: boolean }) {
  const epingle = estEpingle(icone, numero);
  if (!epingle) {
    return (
      <div className="relative grid place-items-center" style={{ width: 26, height: 26 }}>
        {pulse && <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: couleur }} />}
        <span className="relative grid place-items-center rounded-full border-2 border-white shadow-md" style={{ width: 24, height: 24, background: couleur }}>
          {icone ? <Pictogramme icone={icone} className="text-white" size={13} strokeWidth={2.4} /> : null}
        </span>
      </div>
    );
  }
  return (
    <div className={`relative ${actif ? 'scale-110' : ''} transition-transform`} style={{ width: 38, height: 46 }}>
      {pulse && <span className="absolute left-1/2 top-[3px] -translate-x-1/2 rounded-full animate-ping opacity-40" style={{ width: 32, height: 32, background: couleur }} />}
      <svg viewBox="0 0 38 46" width={38} height={46} className="relative drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)]" aria-hidden>
        <path d="M19 45C19 45 3 28.5 3 18.5a16 16 0 1 1 32 0C35 28.5 19 45 19 45Z" fill={couleur} stroke="#fff" strokeWidth="2.5" />
      </svg>
      <span className="absolute left-1/2 top-[6px] grid -translate-x-1/2 place-items-center rounded-full bg-white" style={{ width: 24, height: 24 }}>
        {numero !== undefined
          ? <span className="text-[12px] font-bold leading-none" style={{ color: couleur }}>{numero}</span>
          : <Pictogramme icone={icone} size={14} strokeWidth={2.4} style={{ color: couleur }} />}
      </span>
    </div>
  );
}
