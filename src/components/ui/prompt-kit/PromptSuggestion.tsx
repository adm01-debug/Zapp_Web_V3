/**
 * P19 — PromptSuggestion
 * Chip clicável para sugestões de prompt AI.
 */
import { cn } from '@/lib/utils';

export interface PromptSuggestionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function PromptSuggestion({ label, className, ...props }: PromptSuggestionProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/20 bg-muted/30',
        'px-3 py-1.5 text-[12px] text-muted-foreground transition-colors',
        'hover:border-primary/30 hover:bg-primary/5 hover:text-primary',
        className
      )}
      {...props}
    >
      {label}
    </button>
  );
}
