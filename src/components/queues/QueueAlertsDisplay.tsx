import { motion, AnimatePresence } from '@/components/ui/motion';
import { X, Users, Clock, TrendingDown, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueueAlert } from '@/hooks/useQueueGoals';

interface QueueAlertsDisplayProps {
  alerts: QueueAlert[];
  onDismiss?: (alert: QueueAlert) => void;
  onNavigate?: (queueId: string) => void;
}

const alertIcons: Record<QueueAlert['type'], LucideIcon> = {
  waiting_contacts: Users,
  wait_time: Clock,
  assignment_rate: TrendingDown,
  messages_pending: MessageSquare,
};

/** Queue Alerts Display component for the queues section. */
export function QueueAlertsDisplay({ alerts, onDismiss, onNavigate }: QueueAlertsDisplayProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert, index) => {
          const Icon = alertIcons[alert.type];

          return (
            <motion.div
              key={`${alert.queueId}-${alert.type}`}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className={`relative flex items-center gap-3 rounded-lg border p-3 backdrop-blur ${
                alert.severity === 'critical'
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-warning/30 bg-warning/10 text-warning'
              } `}
            >
              <div
                className="h-8 w-1 rounded-full"
                style={{ backgroundColor: alert.queueColor ?? 'hsl(var(--primary))' }}
              />

              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${alert.severity === 'critical' ? 'bg-destructive/20' : 'bg-warning/20'} `}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="cursor-pointer border-none bg-transparent p-0 text-left text-sm font-medium hover:underline"
                    onClick={() => onNavigate?.(alert.queueId)}
                  >
                    {alert.queueName}
                  </button>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${alert.severity === 'critical' ? 'bg-destructive/20' : 'bg-warning/20'} `}
                  >
                    {alert.severity === 'critical' ? 'Crítico' : 'Atenção'}
                  </span>
                </div>
                <p className="truncate text-xs opacity-80">{alert.message}</p>
              </div>

              <div className="text-right">
                <p className="text-lg font-bold">{alert.currentValue}</p>
                <p className="text-xs opacity-60">limite: {alert.threshold}</p>
              </div>

              {onDismiss && (
                <Button
                  aria-label="Dispensar alerta"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-60 hover:opacity-100"
                  onClick={() => onDismiss(alert)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
