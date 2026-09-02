/**
 * E26 — ScrollFade: gradient overlay que some quando atBottom=true.
 * Indica ao usuário que há mais conteúdo abaixo.
 */
import { cn } from '@/lib/utils';

interface ScrollFadeProps {
  atBottom: boolean;
  className?: string;
}

export function ScrollFade({ atBottom, className }: ScrollFadeProps) {
  if (atBottom) return null;
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bottom-0 left-0 right-0 h-16',
        'bg-gradient-to-t from-background to-transparent',
        'transition-opacity duration-200',
        className
      )}
    />
  );
}
