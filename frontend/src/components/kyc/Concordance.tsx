'use client';

import { AlertTriangle, CheckCircle2, CircleSlash, Info } from 'lucide-react';
import type { StatutVerification, Verification } from '@/services/kycService';

export const STYLE_VERIFICATION: Record<StatutVerification, { label: string; classe: string; Icone: typeof Info }> = {
  ok: { label: 'Concordant', classe: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icone: CheckCircle2 },
  ecart: { label: 'Écart', classe: 'text-amber-800 bg-amber-50 border-amber-300', Icone: AlertTriangle },
  manquant: { label: 'Manquant', classe: 'text-red-700 bg-red-50 border-red-200', Icone: CircleSlash },
  info: { label: 'À noter', classe: 'text-sky-700 bg-sky-50 border-sky-200', Icone: Info },
};

export const GROUPES: Record<Verification['groupe'], string> = {
  identite: 'Identité', coordonnees: 'Coordonnées et adresse', activite: 'Activité', finances: 'Revenus et charges', doublons: 'Doublons', sanctions: 'Sanctions et surveillance',
};

/** Une vérification : ce que dit la fiche, ce que montre le dossier, et le verdict. */
export function LigneVerification({ v }: { v: Verification }) {
  const s = STYLE_VERIFICATION[v.statut]; const Icone = s.Icone;
  return (
    <div className={`rounded-lg border p-2.5 text-sm ${s.classe}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 font-medium"><Icone className="h-4 w-4 shrink-0" />{v.libelle}</p>
        <span className="shrink-0 text-xs font-semibold">{s.label}</span>
      </div>
      {(v.fiche || v.dossier) && (
        <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs text-foreground/80 sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Fiche</dt><dd className="break-words">{v.fiche ?? '—'}</dd></div>
          <div><dt className="text-muted-foreground">Dossier / preuve</dt><dd className="break-words">{v.dossier ?? '—'}</dd></div>
        </dl>
      )}
      {v.detail && <p className="mt-1.5 text-xs text-foreground/80">{v.detail}</p>}
    </div>
  );
}

export default function ConcordanceTable({ verifications }: { verifications: Verification[] }) {
  const groupes = Object.keys(GROUPES) as Verification['groupe'][];
  return (
    <div className="space-y-5">
      {groupes.map((g) => {
        const liste = verifications.filter((v) => v.groupe === g);
        if (liste.length === 0) return null;
        return (
          <section key={g} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{GROUPES[g]}</h3>
            <div className="grid gap-2 lg:grid-cols-2">{liste.map((v) => <LigneVerification key={v.code} v={v} />)}</div>
          </section>
        );
      })}
    </div>
  );
}
