/* eslint-disable react-refresh/only-export-components */
import { TrendingUp, TrendingDown, Minus, Smile, Meh, Frown, AlertTriangle } from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
export type { SentimentData } from '@/hooks/useSentimentAnalyses';
export { useRealSentimentData } from '@/hooks/useSentimentAnalyses';

/** Sentiment Icon component for the dashboard section. */
export function SentimentIcon({ score }: { score: number }) {
  if (score >= 0.3) return <Smile className="h-5 w-5 text-success" />;
  if (score >= -0.3) return <Meh className="h-5 w-5 text-warning" />;
  return <Frown className="h-5 w-5 text-destructive" />;
}

/** Trend Indicator component for the dashboard section. */
export function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const percentage = previous !== 0 ? Math.abs((diff / previous) * 100).toFixed(1) : '0';

  if (Math.abs(diff) < 0.05) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-4 w-4" />
        <span className="text-xs">Estável</span>
      </div>
    );
  }

  if (diff > 0) {
    return (
      <div className="flex items-center gap-1 text-success">
        <TrendingUp className="h-4 w-4" />
        <span className="text-xs">+{percentage}%</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-destructive">
      <TrendingDown className="h-4 w-4" />
      <span className="text-xs">-{percentage}%</span>
    </div>
  );
}

/** Sentiment Stats Cards component for the dashboard section. */
export function SentimentStatsCards({
  stats,
}: {
  stats: {
    avgScore: number;
    totalAlerts: number;
    avgPositive: number;
    avgNegative: number;
    recentAvg: number;
    previousAvg: number;
  };
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg bg-muted/50 p-3"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Score Médio</span>
          <SentimentIcon score={stats.avgScore} />
        </div>
        <p
          className={cn(
            'text-xl font-bold',
            stats.avgScore >= 0.3
              ? 'text-success'
              : stats.avgScore >= -0.3
                ? 'text-warning'
                : 'text-destructive'
          )}
        >
          {(stats.avgScore * 100).toFixed(0)}
        </p>
        <TrendIndicator current={stats.recentAvg} previous={stats.previousAvg} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-lg bg-success/10 p-3"
      >
        <span className="text-xs text-muted-foreground">Positivo</span>
        <p className="text-xl font-bold text-success">{stats.avgPositive.toFixed(1)}%</p>
        <span className="text-xs text-muted-foreground">média</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-lg bg-destructive/10 p-3"
      >
        <span className="text-xs text-muted-foreground">Negativo</span>
        <p className="text-xl font-bold text-destructive">{stats.avgNegative.toFixed(1)}%</p>
        <span className="text-xs text-muted-foreground">média</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-lg bg-destructive/10 p-3"
      >
        <div className="mb-1 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-destructive" />
          <span className="text-xs text-muted-foreground">Alertas</span>
        </div>
        <p className="text-xl font-bold text-destructive">{stats.totalAlerts}</p>
        <span className="text-xs text-muted-foreground">no período</span>
      </motion.div>
    </div>
  );
}

interface SentimentDataPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  alerts_count: number;
}

interface TooltipPayloadItem {
  payload: SentimentDataPoint;
}

/** Custom Tooltip Props component for the dashboard section. */
export interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

/** Sentiment Custom Tooltip component for the dashboard section. */
export const SentimentCustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length || !label) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="rounded-lg border bg-popover p-3 text-sm shadow-lg">
      <p className="mb-2 font-medium">
        {format(new Date(label), "dd 'de' MMMM", { locale: ptBR })}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-success" />
            Positivo
          </span>
          <span className="font-medium">{data.positive}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-warning" />
            Neutro
          </span>
          <span className="font-medium">{data.neutral}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-destructive" />
            Negativo
          </span>
          <span className="font-medium">{data.negative}%</span>
        </div>
        {data.alerts_count > 0 && (
          <div className="mt-2 border-t pt-2">
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {data.alerts_count} alertas
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
