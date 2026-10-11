'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { campagnesApi } from '@/services/metierService';

export interface Collaborateur { id: number; prenom: string; nom: string; email?: string; fonction?: string | null; agence?: { nom: string } | null }

/** Recherche d'un collaborateur actif (équipe ou responsable de campagne). */
export function PersonnelPicker({ onChoisir, exclure = [], placeholder = 'Ajouter un collaborateur…' }: { onChoisir: (u: Collaborateur) => void; exclure?: number[]; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Collaborateur[]>([]);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    const t = setTimeout(() => { campagnesApi.personnel(q).then(setItems).catch(() => setItems([])); }, 250);
    return () => clearTimeout(t);
  }, [q, ouvert]);

  const visibles = items.filter((u) => !exclure.includes(u.id));
  return (
    <div className="relative">
      <Input value={q} placeholder={placeholder} onFocus={() => setOuvert(true)} onBlur={() => setTimeout(() => setOuvert(false), 150)} onChange={(e) => setQ(e.target.value)} />
      {ouvert && visibles.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg">
          {visibles.map((u) => (
            <button key={u.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChoisir(u); setQ(''); setOuvert(false); }}>
              <span className="font-medium">{u.prenom} {u.nom}</span>
              <span className="text-xs text-muted-foreground"> · {[u.fonction, u.agence?.nom].filter(Boolean).join(' · ') || u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
