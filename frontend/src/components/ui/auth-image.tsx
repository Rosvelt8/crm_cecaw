'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/axios';
import { cheminFichier } from '@/lib/apiHelpers';

/**
 * Image servie par l'API protégée : elle est récupérée avec le jeton de la session, puis affichée
 * depuis une URL locale. Une balise <img> directe ne pourrait pas s'authentifier.
 */
export default function AuthImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    let objet: string | null = null;
    apiClient.get(cheminFichier(url), { responseType: 'blob' })
      .then((r) => { if (!annule) { objet = URL.createObjectURL(r.data as Blob); setSrc(objet); } })
      .catch(() => { if (!annule) setErreur(true); });
    return () => { annule = true; if (objet) URL.revokeObjectURL(objet); };
  }, [url]);

  if (erreur) return <span className="text-xs text-muted-foreground">Image indisponible</span>;
  if (!src) return <span className={className} style={{ display: 'inline-block', background: 'rgba(0,0,0,0.05)' }} aria-busy="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
