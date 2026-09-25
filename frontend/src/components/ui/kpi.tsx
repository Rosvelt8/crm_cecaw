import { cn } from '@/lib/utils';

/** Tuile d'indicateur : libellé, valeur et précision optionnelle. `ton` colore la valeur. */
export function Kpi({ label, valeur, precision, ton }: { label: string; valeur: React.ReactNode; precision?: string; ton?: 'bon' | 'alerte' | 'mauvais' }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', ton === 'bon' && 'text-success-700', ton === 'alerte' && 'text-warning-700', ton === 'mauvais' && 'text-destructive')}>{valeur}</p>
      {precision && <p className="mt-0.5 text-xs text-muted-foreground">{precision}</p>}
    </div>
  );
}

/** En-tête de page : titre, sous-titre et actions à droite. */
export function EnTete({ titre, sousTitre, children }: { titre: string; sousTitre?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{titre}</h1>
        {sousTitre && <p className="text-sm text-muted-foreground">{sousTitre}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Onglets simples pilotés par l'état de la page. */
export function Onglets<T extends string>({ valeur, onChange, options }: { valeur: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex gap-1 border-b overflow-x-auto">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap', valeur === o.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const fcfa = (n: number | string | null | undefined) => (n == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n))} FCFA`);
