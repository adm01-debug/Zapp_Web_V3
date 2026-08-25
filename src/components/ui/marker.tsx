/**
 * E34 — Marker: separador de data na timeline de mensagens.
 * Linha horizontal com label centralizado (ex: "Hoje", "23 ago").
 */
import { cn } from '@/lib/utils';

interface MarkerProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
}

export function Marker({ label, className, ...props }: MarkerProps) {
  return (
    <div
      role="separator"
      aria-label={label}
      className={cn('my-3 flex items-center gap-3 px-4', className)}
      {...props}
    >
      <div className="h-px flex-1 bg-border/50" />
      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}
