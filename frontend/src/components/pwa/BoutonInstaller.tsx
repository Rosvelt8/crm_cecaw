'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EvenementInstallation extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/** Bouton « Installer l'application » : n'apparaît que si le navigateur propose l'installation et que l'app n'est pas déjà installée. */
export default function BoutonInstaller() {
  const [evenement, setEvenement] = useState<EvenementInstallation | null>(null);

  useEffect(() => {
    const avant = (e: Event) => { e.preventDefault(); setEvenement(e as EvenementInstallation); };
    const installee = () => setEvenement(null);
    window.addEventListener('beforeinstallprompt', avant);
    window.addEventListener('appinstalled', installee);
    return () => { window.removeEventListener('beforeinstallprompt', avant); window.removeEventListener('appinstalled', installee); };
  }, []);

  if (!evenement) return null;
  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 hidden sm:inline-flex" title="Installer CECAW sur cet appareil"
      onClick={async () => { await evenement.prompt(); await evenement.userChoice; setEvenement(null); }}>
      <Download className="h-3.5 w-3.5" />Installer l&apos;application
    </Button>
  );
}
