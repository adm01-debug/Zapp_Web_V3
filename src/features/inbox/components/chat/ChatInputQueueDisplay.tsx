/**
 * P14 (E64) — ChatInputQueueDisplay
 * Indicador de fila de sincronização com shimmer de loading e ícones de status.
 * Exibido quando `message_queue_retry` está ativo e há itens na fila.
 *
 * Nota: `Marker` (E34) é separador de data — semântica incompatível com status
 * de fila. Shimmer vem de `ChatShimmer`. Status visual via ícone animado.
 */
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatShimmer } from '@/components/ui/chat-shimmer';
import type { QueueItem } from '../../hooks/useMessageQueue';
import { getQueueLength } from './chatInputGuards';

interface ChatInputQueueDisplayProps {
  queue: QueueItem[];
  isRetryEnabled: boolean;
  /** Quando true exibe o shimmer de "carregando estado da fila" */
  isLoading?: boolean;
}

type QueueStatus = 'idle' | 'sending' | 'error';

function deriveStatus(queue: QueueItem[]): QueueStatus {
  if (queue.some((q) => q.status === 'failed')) return 'error';
  if (queue.some((q) => q.status === 'sending')) return 'sending';
  return 'idle';
}

export function ChatInputQueueDisplay({
  queue,
  isRetryEnabled,
  isLoading = false,
}: ChatInputQueueDisplayProps) {
  // Shimmer: estado de carregamento antes de saber o status da fila
  if (isLoading) {
    return <ChatShimmer className="mx-2 mb-2 max-w-[240px]" />;
  }

  if (!isRetryEnabled || getQueueLength(queue) === 0) return null;

  const count = getQueueLength(queue);
  const status = deriveStatus(queue);

  return (
    <div
      className={cn(
        'mb-2 flex items-center justify-between rounded-lg border px-2 py-1 transition-colors',
        status === 'error'
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-border/50 bg-muted/20'
      )}
    >
      <div className="flex items-center gap-2">
        {/* Ícone animado de status */}
        <div className="flex items-center gap-1.5">
          {status === 'sending' && (
            <Loader2 className="h-3 w-3 animate-spin text-primary" aria-label="Sincronizando" />
          )}
          {status === 'error' && (
            <AlertCircle className="h-3 w-3 text-destructive" aria-label="Erro na fila" />
          )}
          {status === 'idle' && (
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          )}
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-widest',
              status === 'error' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {status === 'error' ? 'Erro na fila' : 'Sincronização Ativa'}
          </span>
        </div>
        <div className="mx-1 h-3 w-px bg-border" />
        <span className="text-[10px] font-medium text-muted-foreground">
          {count} {count === 1 ? 'mensagem pendente' : 'mensagens pendentes'}
        </span>
      </div>

      {/* Badge de status */}
      <div
        className={cn(
          'flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest',
          status === 'error' ? 'text-destructive' : 'text-success'
        )}
      >
        {status === 'error' ? (
          <>
            <AlertCircle className="h-3 w-3" aria-hidden="true" /> Erro
          </>
        ) : (
          <>
            <Check className="h-3 w-3" aria-hidden="true" /> Ativo
          </>
        )}
      </div>
    </div>
  );
}
