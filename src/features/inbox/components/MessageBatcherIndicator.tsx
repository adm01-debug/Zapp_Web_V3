import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from '@/components/ui/motion';
import { Layers, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { MessageBatcherStatus } from '@/features/inbox';

interface MessageBatcherIndicatorProps {
  status: MessageBatcherStatus | null | undefined;
  /** Optional override classes for positioning the floating indicator. */
  className?: string;
}

/**
 * Small floating chip that surfaces when realtime message UPDATE events are
 * being aggregated by `useMessageUpdateBatcher`, and shows how many updates
 * are queued for the next flush.
 *
 * The indicator stays visible briefly after a flush so very fast bursts are
 * still perceivable; otherwise users would never see it appear.
 */
export function MessageBatcherIndicator({ status, className }: MessageBatcherIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    if (!status) return;
    if (status.isBatching) {
      setVisible(true);
      setDisplayCount(status.pendingCount);
      return;
    }
    // Linger briefly after the flush so the indicator is perceivable.
    const t = setTimeout(() => setVisible(false), 500);
    return () => clearTimeout(t);
  }, [status?.isBatching, status?.pendingCount, status?.flushedBatches, status]);

  if (!status) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className={cn('pointer-events-auto fixed bottom-4 right-4 z-40', className)}
            role="status"
            aria-live="polite"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium shadow-md',
                    'border-primary/30 bg-background/90 text-foreground backdrop-blur'
                  )}
                >
                  {status.isBatching ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden />
                  ) : (
                    <Layers className="h-3 w-3 text-primary" aria-hidden />
                  )}
                  <span>Agregando atualizações</span>
                  <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary">
                    {Math.max(displayCount, status.pendingCount)}
                  </span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[260px] text-xs">
                <p className="mb-0.5 font-medium">Agrupador de mensagens em tempo real</p>
                <p className="text-muted-foreground">
                  Atualizações rápidas de status são agrupadas em janelas de ~100ms para reduzir
                  re-renders. Lotes processados nesta sessão:{' '}
                  <span className="font-medium text-foreground">{status.flushedBatches}</span>.
                </p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
}
