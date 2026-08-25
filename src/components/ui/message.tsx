/**
 * E32 — Message: wrapper semântico de item de mensagem na timeline.
 * Provê layout de alinhamento (sent/received) e slot de metadados.
 */
import { cn } from '@/lib/utils';

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  side: 'sent' | 'received';
}

/** Container de alinhamento da mensagem. */
export function Message({ side, className, children, ...props }: MessageProps) {
  return (
    <div
      className={cn('flex w-full', side === 'sent' ? 'justify-end' : 'justify-start', className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface MessageMetaProps extends React.HTMLAttributes<HTMLDivElement> {
  side: 'sent' | 'received';
}

/** Linha de metadados abaixo da bolha (timestamp, status, etc). */
export function MessageMeta({ side, className, children, ...props }: MessageMetaProps) {
  return (
    <div
      className={cn(
        'mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground',
        side === 'sent' ? 'justify-end' : 'justify-start',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
