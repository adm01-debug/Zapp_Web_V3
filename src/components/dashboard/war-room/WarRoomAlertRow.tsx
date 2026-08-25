import { motion } from '@/components/ui/motion';
import { AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WarRoomAlert } from '@/hooks/useWarRoomData';

interface AlertRowProps {
  alert: WarRoomAlert;
  onDismiss: () => void;
}

const alertStyles = {
  critical: 'bg-destructive/10 border-destructive text-destructive',
  warning: 'bg-warning/10 border-warning text-warning',
  info: 'bg-muted border-muted-foreground/20 text-muted-foreground',
};

/** War Room Alert Row component for the dashboard section. */
export function WarRoomAlertRow({ alert, onDismiss }: AlertRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3',
        alertStyles[alert.type],
        alert.isNew && alert.type === 'critical' && 'animate-pulse'
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{alert.title}</div>
        <div className="text-xs opacity-80">{alert.message}</div>
        <div className="mt-1 text-xs opacity-60">{alert.timestamp.toLocaleTimeString()}</div>
      </div>
      <Button
        aria-label="Dispensar alerta"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onDismiss}
      >
        <XCircle className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}
