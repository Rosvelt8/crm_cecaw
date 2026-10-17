'use client';

import { useEffect } from 'react';

/** Enregistre le service worker (production uniquement : en développement il gênerait le rechargement à chaud). */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const enregistrer = () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined); };
    if (document.readyState === 'complete') enregistrer(); else window.addEventListener('load', enregistrer, { once: true });
  }, []);
  return null;
}
