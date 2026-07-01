'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  MapPin, 
  Navigation, 
  Layers, 
  MoreHorizontal,
  Users,
  Activity
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

// Dynamic import for Leaflet (client-side only)
const TrackingMap = dynamic(() => import('@/components/maps/TrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted rounded-xl animate-pulse">
      <MapPin className="h-8 w-8 text-muted-foreground animate-bounce" />
      <span className="ml-2 font-medium text-muted-foreground">Chargement de la carte...</span>
    </div>
  ),
});

export default function GeolocationPage() {
  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Géolocalisation Terrain</h1>
          <p className="text-sm text-muted-foreground">Suivi en temps réel des agents et optimisation des itinéraires.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="justify-center">
            <Layers className="mr-2 h-4 w-4" />
            Heatmaps
          </Button>
          <Button variant="brand" size="sm" className="justify-center">
            <Navigation className="mr-2 h-4 w-4" />
            Optimiser Itinéraires
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Sidebar - Agents List */}
        <Card className="w-full lg:w-72 lg:shrink-0 flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm flex items-center justify-between">
              Agents en ligne
              <Badge variant="success">4</Badge>
            </CardTitle>
            <div className="mt-2">
              <Input placeholder="Rechercher agent..." className="h-8 text-xs pl-8" icon={<Search className="h-3 w-3" />} />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto flex-1">
            <div className="divide-y">
               {[
                 { id: 1, name: "Mvondo Jean", team: "Douala-A", status: "actif", dist: "1.2km" },
                 { id: 2, name: "Kamga Eric", team: "Douala-A", status: "actif", dist: "3.5km" },
                 { id: 3, name: "Ngassa Marie", team: "Douala-B", status: "pause", dist: "0.8km" },
                 { id: 4, name: "Talla Pierre", team: "Douala-B", status: "actif", dist: "5.1km" },
               ].map((agent) => (
                 <div key={agent.id} className="p-3 hover:bg-muted/50 cursor-pointer transition-colors group">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">
                            {agent.name.split(' ')[0][0]}{agent.name.split(' ')[1][0]}
                         </div>
                         <div className="flex flex-col">
                            <span className="text-xs font-semibold">{agent.name}</span>
                            <span className="text-[10px] text-muted-foreground">{agent.team} • {agent.dist}</span>
                         </div>
                      </div>
                      <div className={`h-2 w-2 rounded-full ${agent.status === 'actif' ? 'bg-success-500' : 'bg-warning-500'}`} />
                   </div>
                 </div>
               ))}
            </div>
          </CardContent>
          <div className="p-4 border-t bg-muted/30">
             <Button variant="ghost" className="w-full text-xs h-8 justify-between">
                Voir toutes les équipes
                <Users className="h-3 w-3" />
             </Button>
          </div>
        </Card>

        {/* Map Area */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
           <div className="flex-1 min-h-0">
              <TrackingMap />
           </div>

           {/* Mini stats at bottom of map */}
           <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 shrink-0">
              <Card className="p-3 bg-brand-50/50 border-brand-100">
                 <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-brand-600" />
                    <span className="text-xs font-medium">Distance totale</span>
                 </div>
                 <div className="text-lg font-bold mt-1">42.5 km</div>
              </Card>
              <Card className="p-3 bg-success-50/50 border-success-100">
                 <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-success-600" />
                    <span className="text-xs font-medium">Visites réalisées</span>
                 </div>
                 <div className="text-lg font-bold mt-1">18 / 25</div>
              </Card>
              <Card className="p-3 bg-amber-50/50 border-amber-100">
                 <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-medium">Points d'arrêt</span>
                 </div>
                 <div className="text-lg font-bold mt-1">6 alertes</div>
              </Card>
           </div>
        </div>
      </div>
    </div>
  );
}
