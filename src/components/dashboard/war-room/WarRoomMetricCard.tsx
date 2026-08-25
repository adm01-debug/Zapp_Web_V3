import { motion } from '@/components/ui/motion';
import { TrendingUp, TrendingDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  icon: typeof Users;
  label: string;
  value: number | string;
  suffix?: string;
  trend?: 'up' | 'down' | 'stable';
  alert?: boolean;
  critical?: boolean;
  positive?: boolean;
}

/** War Room Metric Card component for the dashboard section. */
export function WarRoomMetricCard({
  icon: Icon,
  label,
  value,
  suffix,
  trend,
  alert,
  critical,
  positive,
}: MetricCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={cn(
        'rounded-xl border bg-card p-4 transition-all',
        critical && 'animate-pulse border-destructive bg-destructive/10',
        alert && !critical && 'border-warning bg-warning/10',
        positive && 'border-success/50'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <Icon
          className={cn(
            'h-5 w-5',
            critical
              ? 'text-destructive'
              : alert
                ? 'text-warning'
                : positive
                  ? 'text-success'
                  : 'text-muted-foreground'
          )}
        />
        {trend === 'up' && (
          <TrendingUp className={cn('h-4 w-4', positive ? 'text-success' : 'text-destructive')} />
        )}
        {trend === 'down' && (
          <TrendingDown className={cn('h-4 w-4', positive ? 'text-destructive' : 'text-success')} />
        )}
      </div>
      <div className="truncate text-2xl font-bold">
        {value}
        {suffix && <span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span>}
      </div>
      <div className="break-words text-xs text-muted-foreground">{label}</div>
    </motion.div>
  );
}
