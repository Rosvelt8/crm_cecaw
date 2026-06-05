export type NotificationType =
  | 'info'
  | 'succes'
  | 'avertissement'
  | 'erreur'
  | 'credit'
  | 'epargne'
  | 'objectif'
  | 'systeme';

export type CanalNotification = 'interne' | 'email' | 'sms' | 'whatsapp' | 'push';

export interface Notification {
  id: number;
  user_id: number;
  titre: string;
  message: string;
  type: NotificationType;
  canal: CanalNotification[];
  est_lu: boolean;
  lien?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  lu_at?: string;
}

export interface NotificationState {
  notifications: Notification[];
  unread_count: number;
  is_loading: boolean;
}
