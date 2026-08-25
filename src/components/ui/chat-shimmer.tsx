/**
 * E27 — ChatShimmer: skeleton de 3 linhas para loading state de mensagens.
 */
import { cn } from '@/lib/utils';

function ShimmerLine({ className }: { className?: string }) {
  return <div className={cn('h-4 animate-pulse rounded-full bg-muted', className)} />;
}

interface ChatShimmerProps {
  className?: string;
}

export function ChatShimmer({ className }: ChatShimmerProps) {
  return (
    <div
      role="status"
      aria-label="Carregando mensagens"
      className={cn('flex flex-col gap-3 px-4 py-6', className)}
    >
      {/* bolha recebida — larga */}
      <div className="flex flex-col gap-2">
        <ShimmerLine className="w-[55%]" />
        <ShimmerLine className="w-[40%]" />
      </div>

      {/* bolha enviada — curta, à direita */}
      <div className="flex flex-col items-end gap-2">
        <ShimmerLine className="w-[35%]" />
      </div>

      {/* bolha recebida — média */}
      <div className="flex flex-col gap-2">
        <ShimmerLine className="w-[48%]" />
        <ShimmerLine className="w-[30%]" />
      </div>
    </div>
  );
}
