'use client';

import React from 'react';
import Link from 'next/link';
import { Home, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-8 text-center">
      <div className="relative mb-8">
        <h1 className="text-9xl font-black text-muted opacity-20">404</h1>
        <div className="absolute inset-0 flex items-center justify-center">
           <AlertTriangle className="h-20 w-20 text-brand-600 animate-bounce-gentle" />
        </div>
      </div>
      
      <h2 className="text-3xl font-bold tracking-tight mb-2">Page Introuvable</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        Désolé, la page que vous recherchez semble avoir été déplacée ou n'existe plus dans le système CECAW CRM.
      </p>
      
      <div className="flex items-center gap-4">
         <Link href="/dashboard">
            <Button variant="brand" className="h-11 px-8">
               <Home className="mr-2 h-4 w-4" />
               Retour au Dashboard
            </Button>
         </Link>
         <Button variant="ghost" className="h-11 px-8" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Page précédente
         </Button>
      </div>
    </div>
  );
}
