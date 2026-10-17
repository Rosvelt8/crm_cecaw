'use client';
/* eslint-disable @next/next/no-img-element -- l'aperçu lit un blob authentifié : next/image ne s'y applique pas */

import { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/axios';
import { cheminFichier } from '@/lib/apiHelpers';
import type { PieceDossier } from '@/services/kycService';

/** Visionneuse d'une pièce du dossier (image ou PDF) : le contrôleur lit le document sans quitter la page. */
export default function ApercuPiece({ piece, onFermer }: { piece: PieceDossier; onFermer: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [type, setType] = useState<string>('');
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false; let objet: string | null = null;
    apiClient.get(cheminFichier(piece.url), { responseType: 'blob' }).then((r) => {
      if (annule) return;
      const blob = r.data as Blob;
      objet = URL.createObjectURL(blob); setType(blob.type || piece.typeMime || ''); setUrl(objet);
    }).catch(() => { if (!annule) setErreur(true); });
    return () => { annule = true; if (objet) URL.revokeObjectURL(objet); };
  }, [piece]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onFermer} role="dialog" aria-modal="true">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0"><p className="truncate font-semibold">{piece.intitule}</p><p className="truncate text-xs text-muted-foreground">{piece.nomFichier} · version {piece.version}</p></div>
          <div className="flex shrink-0 items-center gap-2">
            {url && <a href={url} download={piece.nomFichier}><Button size="sm" variant="outline"><Download className="mr-1.5 h-4 w-4" />Télécharger</Button></a>}
            <Button size="sm" variant="ghost" onClick={onFermer} aria-label="Fermer"><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40">
          {erreur ? <p className="text-sm text-destructive">Fichier indisponible.</p>
            : !url ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            : type.startsWith('image/') ? <img src={url} alt={piece.intitule} className="max-h-full max-w-full object-contain" />
            : type === 'application/pdf' ? <iframe src={url} title={piece.intitule} className="h-full w-full" />
            : <p className="text-sm text-muted-foreground">Aperçu indisponible pour ce format : utilisez « Télécharger ».</p>}
        </div>
      </div>
    </div>
  );
}
