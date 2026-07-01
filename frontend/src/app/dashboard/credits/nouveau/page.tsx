'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Wallet, User, Shield, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn, formatCurrency } from '@/lib/utils';
import { creditService } from '@/services/creditService';

const clientsDisponibles = [
  { id: '1', nom: 'Zambo Paul', code: 'CL001', score: 82 },
  { id: '3', nom: "Eto'o Samuel", code: 'CL003', score: 95 },
  { id: '2', nom: 'Moukoko Hélène', code: 'CL002', score: 61 },
  { id: '4', nom: 'Ngando Pierre', code: 'CL004', score: 45 },
  { id: '5', nom: 'Association Femmes Solidaires', code: 'CL005', score: 78 },
];

const creditSchema = z.object({
  clientId: z.string().min(1, 'Veuillez sélectionner un client'),
  type: z.enum(['individuel', 'solidaire', 'pme', 'agri'] as const, { message: 'Type requis' }),
  montant: z.string().min(1, 'Montant requis').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Montant invalide'
  ),
  duree: z.string().min(1, 'Durée requise').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Durée invalide'
  ),
  frequence: z.enum(['mensuel', 'hebdomadaire', 'trimestriel']),
  objet: z.string().min(10, "L'objet doit comporter au moins 10 caractères"),
  garantieType: z.string().min(1, 'Type de garantie requis'),
  garantieValeur: z.string().min(1, 'Valeur estimée requise').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Valeur invalide'
  ),
});

type CreditFormValues = z.infer<typeof creditSchema>;

const STEPS = [
  { n: 1, label: 'Client', icon: User },
  { n: 2, label: 'Financement', icon: Wallet },
  { n: 3, label: 'Garanties', icon: Shield },
];

export default function NewCreditPage() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedRef, setSubmittedRef] = useState('');
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<CreditFormValues>({
    resolver: zodResolver(creditSchema),
    defaultValues: { type: 'individuel', frequence: 'mensuel' },
  });

  const clientId = watch('clientId');
  const montant = watch('montant');
  const selectedClient = clientsDisponibles.find((c) => c.id === clientId);

  const goNext = async () => {
    const fields: (keyof CreditFormValues)[][] = [
      ['clientId', 'type'],
      ['montant', 'duree', 'frequence', 'objet'],
      ['garantieType', 'garantieValeur'],
    ];
    const valid = await trigger(fields[step - 1]);
    if (valid) setStep((s) => s + 1);
  };

  const onSubmit = async (data: CreditFormValues) => {
    setIsLoading(true);
    try {
      const client = clientsDisponibles.find((c) => c.id === data.clientId);
      const result = await creditService.createDemande({
        client_id: Number(data.clientId),
        clientNom: client?.nom,
        type_credit: data.type,
        montant_demande: Number(data.montant),
        duree_mois: Number(data.duree),
        frequence_remboursement: data.frequence,
        objet_financement: data.objet,
        garantie_principale: data.garantieType,
        valeur_garantie: Number(data.garantieValeur),
      } as any);
      setSubmittedRef((result.data as any).ref);
      setSubmitted(true);
      toast.success('Demande soumise avec succès', {
        description: `Référence : ${(result.data as any).ref}`,
      });
    } catch {
      toast.error('Erreur lors de la soumission');
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto mt-8 sm:mt-16 text-center space-y-6 px-4">
        <div className="h-20 w-20 rounded-full bg-success-50 text-success-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Demande soumise !</h1>
          <p className="text-muted-foreground mt-2">
            Votre demande de crédit <span className="font-mono font-bold text-brand-600">{submittedRef}</span> est maintenant en attente d'analyse.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setSubmitted(false); setStep(1); }}>
            Nouvelle demande
          </Button>
          <Button variant="brand" className="w-full sm:w-auto" onClick={() => router.push('/dashboard/credits')}>
            Voir le portefeuille
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 px-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Nouvelle Demande de Crédit</h1>
        <p className="text-muted-foreground text-sm sm:text-base">Formulaire de demande de financement avec workflow de validation.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-0 overflow-x-auto px-2 -mx-4">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center border-2 transition-colors',
                step === s.n ? 'border-brand-600 bg-brand-600 text-white' :
                step > s.n ? 'border-success-500 bg-success-50 text-success-600' :
                'border-muted bg-muted/50 text-muted-foreground'
              )}>
                {step > s.n ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              <span className={cn('text-xs font-medium', step === s.n ? 'text-brand-700' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('h-[2px] w-24 mx-2 mb-5 transition-colors', step > s.n ? 'bg-success-400' : 'bg-muted')} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="shadow-lg border-brand-100">
          <CardHeader>
            <CardTitle>
              {step === 1 && 'Identification du Client'}
              {step === 2 && 'Détails du Financement'}
              {step === 3 && 'Garanties & Pièces Jointes'}
            </CardTitle>
            <CardDescription>
              Renseignez scrupuleusement les informations pour l'analyse de risque.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Étape 1 — Client */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-2">
                  <Label>Sélectionner un client <span className="text-red-500">*</span></Label>
                  <Select onValueChange={(v) => setValue('clientId', v)}>
                    <SelectTrigger className={errors.clientId ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Choisir un client..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clientsDisponibles.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-medium">{c.nom}</span>
                          <span className="text-xs text-muted-foreground ml-2">({c.code})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.clientId && <p className="text-xs text-destructive">{errors.clientId.message}</p>}
                </div>

                {selectedClient && (
                  <div className="p-4 bg-brand-50/50 border border-brand-100 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-center animate-in fade-in">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold">Code</div>
                      <div className="font-mono font-bold text-sm">{selectedClient.code}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold">Score Cecaw Finance</div>
                      <div className={cn(
                        'font-bold text-sm',
                        selectedClient.score > 75 ? 'text-success-600' :
                        selectedClient.score > 50 ? 'text-warning-600' : 'text-danger-600'
                      )}>
                        {selectedClient.score} / 100
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold">Éligibilité</div>
                      <div className={cn('font-bold text-sm', selectedClient.score > 50 ? 'text-success-600' : 'text-danger-600')}>
                        {selectedClient.score > 50 ? 'Éligible' : 'Risqué'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Type de Crédit <span className="text-red-500">*</span></Label>
                  <Select defaultValue="individuel" onValueChange={(v) => setValue('type', v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individuel">Crédit Individuel</SelectItem>
                      <SelectItem value="solidaire">Crédit Groupe Solidaire</SelectItem>
                      <SelectItem value="pme">Crédit PME / Entreprise</SelectItem>
                      <SelectItem value="agri">Crédit Agricole</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Étape 2 — Financement */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Montant demandé (FCFA) <span className="text-red-500">*</span></Label>
                    <Input
                      type="number"
                      placeholder="Ex : 1 500 000"
                      {...register('montant')}
                      error={!!errors.montant}
                    />
                    {errors.montant && <p className="text-xs text-destructive">{errors.montant.message}</p>}
                    {montant && !isNaN(Number(montant)) && Number(montant) > 0 && (
                      <p className="text-xs text-muted-foreground">{formatCurrency(Number(montant))}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Durée (mois) <span className="text-red-500">*</span></Label>
                    <Input
                      type="number"
                      placeholder="Ex : 12"
                      min="1"
                      max="60"
                      {...register('duree')}
                      error={!!errors.duree}
                    />
                    {errors.duree && <p className="text-xs text-destructive">{errors.duree.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Fréquence de remboursement</Label>
                  <Select defaultValue="mensuel" onValueChange={(v) => setValue('frequence', v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hebdomadaire">Hebdomadaire</SelectItem>
                      <SelectItem value="mensuel">Mensuel</SelectItem>
                      <SelectItem value="trimestriel">Trimestriel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Objet du financement <span className="text-red-500">*</span></Label>
                  <textarea
                    className={cn(
                      'flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      errors.objet && 'border-red-500'
                    )}
                    placeholder="Expliquez en détail l'utilisation des fonds..."
                    {...register('objet')}
                  />
                  {errors.objet && <p className="text-xs text-destructive">{errors.objet.message}</p>}
                </div>
              </div>
            )}

            {/* Étape 3 — Garanties */}
            {step === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type de garantie principale <span className="text-red-500">*</span></Label>
                    <Select onValueChange={(v) => setValue('garantieType', v)}>
                      <SelectTrigger className={errors.garantieType ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="salaire">Cession de Salaire</SelectItem>
                        <SelectItem value="immobilier">Titre Foncier / Hypothèque</SelectItem>
                        <SelectItem value="materiel">Gage Matériel (Véhicule, etc.)</SelectItem>
                        <SelectItem value="tiers_garant">Tiers Garant</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.garantieType && <p className="text-xs text-destructive">{errors.garantieType.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Valeur estimée (FCFA) <span className="text-red-500">*</span></Label>
                    <Input
                      type="number"
                      placeholder="Ex : 5 000 000"
                      {...register('garantieValeur')}
                      error={!!errors.garantieValeur}
                    />
                    {errors.garantieValeur && <p className="text-xs text-destructive">{errors.garantieValeur.message}</p>}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Documents justificatifs</Label>
                  <div className="border-2 border-dashed border-muted rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors cursor-pointer">
                    <Shield className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm font-medium">Cliquez pour ajouter des fichiers</span>
                    <span className="text-[10px] text-muted-foreground">PDF, JPG — Max 5 MB chacun</span>
                  </div>
                </div>

                {/* Récapitulatif */}
                <div className="p-4 bg-muted/30 rounded-xl border space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Récapitulatif</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Client</span>
                    <span className="font-bold">{selectedClient?.nom ?? '—'}</span>
                    <span className="text-muted-foreground">Montant</span>
                    <span className="font-bold">{watch('montant') ? formatCurrency(Number(watch('montant'))) : '—'}</span>
                    <span className="text-muted-foreground">Durée</span>
                    <span className="font-bold">{watch('duree') ? `${watch('duree')} mois` : '—'}</span>
                    <span className="text-muted-foreground">Fréquence</span>
                    <span className="font-bold capitalize">{watch('frequence')}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          <Separator />
          <div className="p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            {step > 1 ? (
              <Button type="button" variant="ghost" className="w-full sm:w-auto order-2 sm:order-1" onClick={() => setStep((s) => s - 1)}>
                Précédent
              </Button>
            ) : (
              <div className="order-2 sm:order-1" />
            )}
            {step < 3 ? (
              <Button type="button" variant="brand" className="w-full sm:w-auto order-1 sm:order-2" onClick={goNext}>
                Suivant <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" variant="success" disabled={isLoading} className="w-full sm:w-auto min-w-[160px] order-1 sm:order-2">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Envoi en cours...' : 'Soumettre la demande'}
              </Button>
            )}
          </div>
        </Card>
      </form>
    </div>
  );
}
