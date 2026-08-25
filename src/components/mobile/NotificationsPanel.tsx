import { useEffect } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { X, Bell, MessageSquare, UserPlus, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Notification component for the mobile section. */
export interface Notification {
  id: string;
  type: 'message' | 'assignment' | 'sla_warning' | 'resolved' | 'system';
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  contactName?: string;
  contactAvatar?: string;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkAllRead: () => void;
  onNotificationClick?: (notification: Notification) => void;
}

const typeConfig: Record<
  Notification['type'],
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  message: { icon: MessageSquare, color: 'text-primary bg-primary/10' },
  assignment: { icon: UserPlus, color: 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]' },
  sla_warning: { icon: AlertTriangle, color: 'text-destructive bg-destructive/10' },
  resolved: { icon: CheckCircle, color: 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]' },
  system: { icon: Clock, color: 'text-muted-foreground bg-muted' },
};

/** Notifications Panel component for the mobile section. */
export function NotificationsPanel({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onNotificationClick,
}: NotificationsPanelProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-background/40 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="safe-area-top fixed left-2 right-2 top-14 z-[91] flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:left-auto md:right-4 md:w-[380px]"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onMarkAllRead}
                    className="h-7 text-[11px] text-primary hover:text-primary"
                  >
                    Marcar todas como lidas
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  onClick={onClose}
                  aria-label="Fechar notificações"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-12">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <Bell className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <p className="mb-1 text-sm font-medium text-foreground">Tudo em dia!</p>
                  <p className="text-center text-xs text-muted-foreground">
                    Nenhuma notificação no momento
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((notification) => {
                    const config = typeConfig[notification.type];
                    const Icon = config.icon;
                    return (
                      <motion.button
                        key={notification.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => onNotificationClick?.(notification)}
                        className={cn(
                          'flex w-full touch-manipulation items-start gap-3 px-4 py-3 text-left transition-colors',
                          !notification.read
                            ? 'bg-primary/[0.03] hover:bg-primary/[0.06]'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        {/* Icon */}
                        <div
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                            config.color
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                'text-xs leading-tight',
                                !notification.read
                                  ? 'font-semibold text-foreground'
                                  : 'font-medium text-foreground/80'
                              )}
                            >
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {notification.description}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground/60">
                            {formatDistanceToNow(notification.timestamp, {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
