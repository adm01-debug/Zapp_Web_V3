/**
 * P19 — PromptActions
 * Barra inferior com botões de enviar e limpar o prompt AI.
 */
import { SendHorizonal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PromptActionsProps {
  onSend?: () => void;
  onClear?: () => void;
  isLoading?: boolean;
  canSend?: boolean;
  className?: string;
}

export function PromptActions({
  onSend,
  onClear,
  isLoading,
  canSend = true,
  className,
}: PromptActionsProps) {
  return (
    <div className={cn('flex items-center justify-end gap-2', className)}>
      {onClear && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={onClear}
          disabled={isLoading}
          aria-label="Limpar"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        className="rounded-full gap-1.5"
        onClick={onSend}
        disabled={!canSend || isLoading}
        aria-label="Enviar"
      >
        <SendHorizonal className="h-3.5 w-3.5" />
        Enviar
      </Button>
    </div>
  );
}
