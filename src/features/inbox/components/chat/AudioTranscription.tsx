/**
 * P22 — AudioTranscription
 * Componente de transcrição de áudio com 4 estados:
 * idle | loading | success | error
 */
import { Mic, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatShimmer } from '@/components/ui/chat-shimmer';
import { cn } from '@/lib/utils';

export type TranscriptionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AudioTranscriptionProps {
  status: TranscriptionStatus;
  transcription?: string;
  error?: string;
  onTranscribe?: () => void;
  onRetry?: () => void;
  onCopy?: (text: string) => void;
  className?: string;
}

export function AudioTranscription({
  status,
  transcription,
  error,
  onTranscribe,
  onRetry,
  onCopy,
  className,
}: AudioTranscriptionProps) {
  return (
    <div className={cn('rounded-xl border border-border/20 bg-muted/10 p-3', className)}>
      {status === 'idle' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onTranscribe}
          aria-label="Transcrever áudio"
        >
          <Mic className="h-3.5 w-3.5" />
          Transcrever
        </Button>
      )}

      {status === 'loading' && (
        <div className="flex flex-col gap-2">
          <ChatShimmer />
          <span className="text-[12px] text-muted-foreground">Transcrevendo...</span>
        </div>
      )}

      {status === 'success' && transcription && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] leading-relaxed text-foreground">{transcription}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit gap-1.5"
            onClick={() => onCopy?.(transcription)}
            aria-label="Copiar transcrição"
          >
            <Copy className="h-3 w-3" />
            Copiar
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-destructive">
            {error ?? 'Erro ao transcrever. Tente novamente.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={onRetry}
            aria-label="Tentar novamente"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
}
