'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Plus,
  FileText, 
  BarChart3, 
  PieChart as PieChartIcon, 
  Download, 
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  FileJson
} from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  Cell
} from 'recharts';

const reportTypes = [
  { id: 'credit', title: 'Portefeuille Crédit', description: 'État des encours, impayés et recouvrements.', icon: BarChart3 },
  { id: 'epargne', title: 'Collecte Épargne', description: 'Volume des dépôts, retraits et épargne stable.', icon: PieChartIcon },
  { id: 'performance', title: 'Performance Agents', description: 'Productivité et objectifs des agents terrain.', icon: TrendingUp },
  { id: 'activite', title: 'Journal d\'Activité', description: 'Logs des opérations et connexions système.', icon: FileText },
];

const data = [
  { name: 'Akwa', value: 45000000 },
  { name: 'Bonanjo', value: 32000000 },
  { name: 'Bassa', value: 21000000 },
  { name: 'Deido', value: 18000000 },
  { name: 'Logbessou', value: 12000000 },
];

export default function ReportingPage() {
  const [selectedReport, setSelectedReport] = useState('credit');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Centre de Reporting</h1>
          <p className="text-muted-foreground">Générez des rapports détaillés et analysez les indicateurs de performance clés.</p>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="brand" size="sm">
              <Plus className="mr-2 h-4 w-4" /> Nouveau Rapport Personnalisé
           </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 sm:grid-cols-4 lg:gap-6 lg:grid-cols-4">
         {/* Report Type Selector */}
         <div className="sm:col-span-1 space-y-3 sm:space-y-4">
            {reportTypes.map((report) => (
               <Card 
                  key={report.id} 
                  className={cn(
                    "p-4 cursor-pointer transition-all hover:bg-muted/50 border-2",
                    selectedReport === report.id ? "border-brand-500 bg-brand-50/10" : "border-transparent"
                  )}
                  onClick={() => setSelectedReport(report.id)}
               >
                  <div className="flex items-center gap-3">
                     <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center",
                        selectedReport === report.id ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground"
                     )}>
                        <report.icon className="h-5 w-5" />
                     </div>
                     <div className="flex flex-col">
                        <span className="text-sm font-bold">{report.title}</span>
                        <span className="text-[10px] text-muted-foreground line-clamp-1">{report.description}</span>
                     </div>
                  </div>
               </Card>
            ))}
            
            <Separator className="my-6" />
            
            <Card className="p-4 bg-muted/20 border-dashed">
               <CardHeader className="p-0 mb-3">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Configuration</CardTitle>
               </CardHeader>
               <div className="space-y-4">
                  <div className="space-y-2">
                     <label className="text-[11px] font-bold text-muted-foreground uppercase">Période</label>
                     <Select defaultValue="month">
                        <SelectTrigger className="h-8 text-xs">
                           <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="today">Aujourd'hui</SelectItem>
                           <SelectItem value="week">Cette semaine</SelectItem>
                           <SelectItem value="month">Ce mois</SelectItem>
                           <SelectItem value="year">Cette année</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[11px] font-bold text-muted-foreground uppercase">Agence</label>
                     <Select defaultValue="all">
                        <SelectTrigger className="h-8 text-xs">
                           <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="all">Toutes les agences</SelectItem>
                           <SelectItem value="akwa">Douala Akwa</SelectItem>
                           <SelectItem value="bonanjo">Douala Bonanjo</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
                  <Button className="w-full h-8 text-xs" variant="outline">
                     <Filter className="h-3 w-3 mr-2" /> Appliquer Filtres
                  </Button>
               </div>
            </Card>
         </div>

         {/* Report Content */}
         <div className="sm:col-span-3 space-y-4 sm:space-y-6">
            <Card>
               <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                     <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 text-base sm:text-lg">
                        {reportTypes.find(r => r.id === selectedReport)?.title}
                        <Badge variant="outline" className="text-[10px] font-bold h-5 w-fit">MAI 2024</Badge>
                     </CardTitle>
                     <CardDescription className="text-xs sm:text-sm">Aperçu visuel des données consolidées.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                     <Button variant="outline" size="sm" className="h-8 text-xs flex-1 sm:flex-none">
                        <FileSpreadsheet className="h-3 w-3 mr-2 text-success-600" /> Excel
                     </Button>
                     <Button variant="brand" size="sm" className="h-8 text-xs flex-1 sm:flex-none">
                        <Download className="h-3 w-3 mr-2" /> PDF
                     </Button>
                  </div>
               </CardHeader>
               <CardContent>
                  <div className="h-[300px] w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                           <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `${val/1000000}M`} />
                           <Tooltip 
                              cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                           />
                           <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                              {data.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={index === 0 ? '#1d4ed8' : '#3b82f6'} fillOpacity={0.8} />
                              ))}
                           </Bar>
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
                  
                  <div className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
                     <div className="p-4 rounded-xl bg-muted/20 border">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Encours Global</div>
                        <div className="text-xl font-bold">{formatCurrency(128450000, true)}</div>
                        <div className="mt-2 text-[10px] text-success-600 font-bold flex items-center gap-1">
                           <TrendingUp className="h-3 w-3" /> +12% vs Avril
                        </div>
                     </div>
                     <div className="p-4 rounded-xl bg-muted/20 border">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Productivité Moyenne</div>
                        <div className="text-xl font-bold">18.2M / agent</div>
                        <div className="mt-2 text-[10px] text-brand-600 font-bold flex items-center gap-1">
                           <CheckCircle2 className="h-3 w-3" /> Objectif à 92%
                        </div>
                     </div>
                     <div className="p-4 rounded-xl bg-muted/20 border">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Taux de Risque (PAR30)</div>
                        <div className="text-xl font-bold text-danger-600">4.2%</div>
                        <div className="mt-2 text-[10px] text-danger-600 font-bold flex items-center gap-1">
                           <Clock className="h-3 w-3" /> Zone de vigilance
                        </div>
                     </div>
                  </div>
               </CardContent>
            </Card>

            <Card>
               <CardHeader>
                  <CardTitle className="text-sm">Rapports Récents Générés</CardTitle>
               </CardHeader>
               <CardContent className="p-0">
                  <div className="divide-y">
                     {[
                        { name: 'Bilan Mensuel Avril.pdf', type: 'Financier', date: '02 Mai 2024', size: '2.4 MB' },
                        { name: 'Performance_Terrain_S18.xlsx', type: 'Opérationnel', date: '05 Mai 2024', size: '1.1 MB' },
                        { name: 'Audit_Securite_Q1.pdf', type: 'Audit', date: '10 Mai 2024', size: '4.8 MB' },
                     ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors group">
                           <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                 <FileText className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex flex-col">
                                 <span className="text-xs font-bold">{item.name}</span>
                                 <span className="text-[10px] text-muted-foreground">{item.type} • {item.date}</span>
                              </div>
                           </div>
                           <div className="flex items-center gap-4">
                              <span className="text-[10px] text-muted-foreground font-mono">{item.size}</span>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <Download className="h-4 w-4" />
                              </Button>
                           </div>
                        </div>
                     ))}
                  </div>
               </CardContent>
            </Card>
         </div>
      </div>
    </div>
  );
}
