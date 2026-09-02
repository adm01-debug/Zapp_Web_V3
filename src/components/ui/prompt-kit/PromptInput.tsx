/**
 * P19 — PromptInput
 * Textarea AI com placeholder dinâmico (não disponível via shadcn registry TW3).
 */
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface PromptInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Placeholder rotativo (array de strings — exibe o primeiro por padrão) */
  placeholders?: string[];
  isLoading?: boolean;
}

export const PromptInput = forwardRef<HTMLTextAreaElement, PromptInputProps>(
  ({ className, placeholders, isLoading, disabled, placeholder, ...props }, ref) => {
    const resolvedPlaceholder = placeholder ?? placeholders?.[0] ?? 'Digite sua pergunta...';

    return (
      <textarea
        ref={ref}
        disabled={disabled ?? isLoading}
        placeholder={resolvedPlaceholder}
        rows={1}
        className={cn(
          'w-full resize-none rounded-2xl border border-border/20 bg-muted/20 px-4 py-3 text-[14px]',
          'outline-none placeholder:text-muted-foreground/40 focus:border-primary/30 focus:ring-2 focus:ring-primary/10',
          'transition-all duration-200',
          (disabled ?? isLoading) && 'opacity-60 pointer-events-none',
          className
        )}
        {...props}
      />
    );
  }
);
PromptInput.displayName = 'PromptInput';
