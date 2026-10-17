import type { MetadataRoute } from 'next';

/** Manifeste PWA : l'application s'installe depuis le navigateur (bureau, Android, iOS) et s'ouvre en fenêtre dédiée. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cecaw Finance S.A - CRM',
    short_name: 'CECAW',
    description: 'Gestion de la relation client, du crédit, de la collecte et de la conformité de Cecaw Finance S.A',
    id: '/',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    lang: 'fr',
    background_color: '#ffffff',
    theme_color: '#b8860b',
    categories: ['finance', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Clients', url: '/dashboard/marketing/clients' },
      { name: 'Demandes de crédit', url: '/dashboard/credits' },
      { name: 'Calendrier des opérations', url: '/dashboard/calendrier' },
    ],
  };
}
