'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell, Wallet, UserSquare2, Target, AlertTriangle, Settings, MoreHorizontal, CheckCheck, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Notif {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'brand' | 'default';
  icon: React.ElementType;
  time: string;
  isRead: boolean;
}

const initialNotifications: Notif[] = [
  { id: 1, title: 'Crédit Approuvé', message: "La demande CR-2024-002 de Eto'o Samuel a été approuvée par le comité.", type: 'success', icon: Wallet, time: 'Il y a 5 min', isRead: false },
  { id: 2, title: 'Objectif Atteint', message: 'Bravo ! Vous avez atteint 100% de votre objectif de collecte hebdomadaire.', type: 'info', icon: Target, time: 'Il y a 1h', isRead: false },
  { id: 3, title: 'Alerte Impayé', message: 'Le client Zambo Paul a une échéance en retard de 3 jours.', type: 'warning', icon: AlertTriangle, time: 'Il y a 3h', isRead: true },
  { id: 4, title: 'Nouveau Prospect', message: 'Un nouveau prospect "Garage du Moungo" a été assigné à votre agence.', type: 'brand', icon: UserSquare2, time: 'Hier', isRead: true },
  { id: 5, title: 'Maintenance Système', message: 'Le CRM sera en maintenance ce soir à partir de 22h00.', type: 'default', icon: Settings, time: 'Hier', isRead: true },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(initialNotifications);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markRead = (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const toggleRead = (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast.success('Toutes les notifications marquées comme lues');
  };

  const dismiss = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    toast.info('Notification supprimée');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Centre de Notifications</h1>
          <p className="text-muted-foreground">
            Restez informé de l'activité de votre portefeuille et des alertes système.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="brand" className="text-sm px-3 py-1">
              {unreadCount} non lu{unreadCount > 1 ? 's' : ''}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Tout marquer comme lu
          </Button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground space-y-4">
          <Bell className="h-12 w-12 opacity-20" />
          <p className="text-sm font-medium">Aucune notification</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <Card
              key={notif.id}
              className={cn(
                'p-4 transition-all hover:bg-muted/30 group border-l-4 cursor-pointer',
                !notif.isRead ? 'bg-brand-50/10 border-l-brand-600' : 'border-l-transparent',
                notif.type === 'warning' && !notif.isRead && 'border-l-warning-500',
                notif.type === 'success' && !notif.isRead && 'border-l-success-500',
              )}
              onClick={() => markRead(notif.id)}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center shrink-0 shadow-sm',
                  notif.type === 'success' && 'bg-success-50 text-success-600',
                  notif.type === 'warning' && 'bg-warning-50 text-warning-600',
                  notif.type === 'info' && 'bg-blue-50 text-blue-600',
                  notif.type === 'brand' && 'bg-brand-50 text-brand-600',
                  notif.type === 'default' && 'bg-muted text-muted-foreground',
                )}>
                  <notif.icon className="h-5 w-5" />
                </div>

                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{notif.title}</span>
                      {!notif.isRead && <div className="h-1.5 w-1.5 rounded-full bg-brand-600 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{notif.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{notif.message}</p>

                  <div className="pt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="link"
                      className="p-0 h-auto text-[10px] font-bold text-brand-600"
                      onClick={(e) => { e.stopPropagation(); toggleRead(notif.id); }}
                    >
                      {notif.isRead ? 'Marquer non lu' : 'Marquer lu'}
                    </Button>
                    <span className="text-muted-foreground/30">•</span>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-[10px] font-medium text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                    >
                      Ignorer
                    </Button>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="text-center py-4">
          <Button variant="outline" className="text-xs" onClick={() => toast.info('Chargement des anciennes notifications...')}>
            Charger les notifications plus anciennes
          </Button>
        </div>
      )}
    </div>
  );
}
