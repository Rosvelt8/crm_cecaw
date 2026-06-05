'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="h-[calc(100vh-200px)] w-full flex flex-col items-center justify-center p-8 text-center">
      <div className="h-20 w-20 rounded-2xl bg-danger-50 text-danger-600 flex items-center justify-center mb-6">
         <AlertTriangle className="h-10 w-10" />
      </div>
      
      <h2 className="text-2xl font-bold tracking-tight mb-2">Une erreur est survenue</h2>
      <p className="text-muted-foreground max-w-md mb-8 text-sm">
        Le système a rencontré un problème inattendu lors du traitement de vos données. L'équipe IT a été notifiée.
      </p>
      
      <div className="flex items-center gap-4">
         <Button variant="brand" onClick={() => reset()} className="h-11 px-8">
            <RotateCcw className="mr-2 h-4 w-4" />
            Réessayer
         </Button>
         <Button variant="ghost" onClick={() => window.location.href = '/dashboard'}>
            Retour à l'accueil
         </Button>
      </div>
      
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-muted/30 rounded-lg text-left overflow-auto max-w-2xl border">
           <p className="text-[10px] font-mono text-muted-foreground break-all">{error.message}</p>
        </div>
      )}
    </div>
  );
}
