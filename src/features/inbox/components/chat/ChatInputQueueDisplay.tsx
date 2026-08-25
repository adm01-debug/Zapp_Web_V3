/**
 * P10 (E61) — ChatInputQueueDisplay
 * Bloco extraído de ChatInputArea.tsx — fila de sincronização de mensagens.
 * Exibe indicador de mensagens pendentes quando `message_queue_retry` está ativo.
 */
import { Check } from 'lucide-react';
import type { QueueItem } from '../../hooks/useMessageQueue';
import { getQueueLength } from './chatInputGuards';

interface ChatInputQueueDisplayProps {
  queue: QueueItem[];
  isRetryEnabled: boolean;
}

export function ChatInputQueueDisplay({ queue, isRetryEnabled }: ChatInputQueueDisplayProps) {
  if (!isRetryEnabled || getQueueLength(queue) === 0) return null;

  const count = getQueueLength(queue);

  return (
    <div className="mb-2 flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-2 py-1">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Sincronização Ativa
          </span>
        </div>
        <div className="mx-1 h-3 w-px bg-border" />
        <span className="text-[10px] font-medium text-muted-foreground">
          {count} {count === 1 ? 'mensagem pendente' : 'mensagens pendentes'}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-success">
        <Check className="h-3 w-3" /> Ativo
      </div>
    </div>
  );
}
