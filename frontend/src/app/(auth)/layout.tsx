'use client';

import type { ReactNode } from 'react';
import AuthGuard from '@/components/auth/AuthGuard';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requireAuth={false}>
      <div className="min-h-screen grid lg:grid-cols-2">
        <div className="relative hidden lg:flex flex-col justify-between p-12 bg-brand-900 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.cecaw.cm/wp-content/uploads/2026/04/eventail-CECAW-e1776351460470.png')] bg-cover bg-center opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-900/90 via-brand-900/50 to-transparent" />
          
          <div className="relative z-10 flex items-center gap-3">
            <img src="/logo.png" alt="CECAW CRM" className="h-12 w-auto object-contain" />
            <span className="text-2xl font-bold tracking-tight uppercase">CECAW CRM</span>
          </div>

          <div className="relative z-10">
            <h1 className="text-4xl font-bold leading-tight mb-4">
              L'outil de microfinance <br /> 
              <span className="text-brand-400">nouvelle génération</span> au Cameroun.
            </h1>
            <p className="text-lg text-brand-100/80 max-w-md">
              Pilotez votre agence, gérez vos crédits et suivez vos agents sur le terrain en temps réel avec une interface moderne et sécurisée.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-4 text-sm text-brand-200">
            <span>© 2026 CECAW Microfinance. Tous droits réservés.</span>
          </div>
        </div>

        <div className="flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-md space-y-8 animate-fade-in">
            <div className="lg:hidden flex justify-center mb-8">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="CECAW CRM" className="h-10 w-auto object-contain" />
                <span className="text-xl font-bold text-brand-900 uppercase">CECAW CRM</span>
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
