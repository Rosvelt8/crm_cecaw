'use client';

import React from 'react';
import Link from 'next/link';
import { Home, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-4 sm:p-8 text-center">
      <div className="relative mb-6 sm:mb-8">
        <h1 className="text-7xl sm:text-9xl font-black text-muted opacity-20">404</h1>
        <div className="absolute inset-0 flex items-center justify-center">
           <AlertTriangle className="h-16 sm:h-20 w-16 sm:w-20 text-brand-600 animate-bounce-gentle" />
        </div>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">Page Introuvable</h2>
      <p className="text-muted-foreground max-w-md mb-6 sm:mb-8 px-2">
        Désolé, la page que vous recherchez semble avoir été déplacée ou n'existe plus dans le système Cecaw Finance S.A.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-4 w-full sm:w-auto px-2">
         <Link href="/dashboard" className="w-full sm:w-auto">
            <Button variant="brand" className="h-10 sm:h-11 px-4 sm:px-8 w-full sm:w-auto">
               <Home className="mr-2 h-4 w-4" />
               Retour au Dashboard
            </Button>
         </Link>
         <Button variant="ghost" className="h-10 sm:h-11 px-4 sm:px-8 w-full sm:w-auto" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Page précédente
         </Button>
      </div>
    </div>
  );
}
