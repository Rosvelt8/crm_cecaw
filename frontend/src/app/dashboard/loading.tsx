import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="h-[calc(100vh-200px)] w-full flex flex-col items-center justify-center gap-4 animate-fade-in">
      <div className="relative">
         <div className="h-16 w-16 rounded-full border-4 border-muted" />
         <div className="h-16 w-16 rounded-full border-4 border-brand-600 border-t-transparent animate-spin absolute inset-0" />
      </div>
      <div className="flex flex-col items-center">
         <p className="text-lg font-bold tracking-tight">Chargement des données...</p>
         <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Cecaw Finance S.A</p>
      </div>
    </div>
  );
}
