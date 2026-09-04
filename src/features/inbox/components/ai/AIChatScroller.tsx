/**
 * P21 — AIChatScroller
 * Container de scroll com stick-to-bottom automático para o painel de AI streaming.
 *
 * Usa `use-stick-to-bottom@1.1.6` (StackBlitz) com a API correta:
 *   const { contentRef, scrollRef, scrollToBottom } = useStickToBottom();
 *
 * NÃO usar "ref" (não existe nessa versão). A API v1.1.6 exige dois refs:
 *   - scrollRef  → vai no div externo com overflow-y-auto (o scroll container)
 *   - contentRef → vai no div filho que cresce (o content container)
 *
 * Scaffolding para o AI streaming chat panel (E42/E73 — próxima sprint).
 * O AIChatScrollerContext exibe `scrollToBottom` para filhos via hook.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';
import type { ScrollToBottom } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';

/** Contexto que expe scroll-to-bottom para filhos (ex: botão de ancoragem). */
interface AIChatScrollerContextValue {
  scrollToBottom: ScrollToBottom;
  isAtBottom: boolean;
}

const AIChatScrollerContext = createContext<AIChatScrollerContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook, não componente
export function useAIChatScrollerContext(): AIChatScrollerContextValue {
  const ctx = useContext(AIChatScrollerContext);
  if (!ctx) throw new Error('useAIChatScrollerContext must be inside <AIChatScroller>');
  return ctx;
}

export interface AIChatScrollerProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Wrapper de scroll com stick-to-bottom automático.
 *
 * Estrutura esperada:
 * ```tsx
 * <AIChatScroller className="flex-1">
 *   {messages.map(m => <AIChatResponseCard key={m.id} {...m} />)}
 * </AIChatScroller>
 * ```
 */
export function AIChatScroller({
  children,
  className,
  contentClassName,
}: AIChatScrollerProps) {
  const { contentRef, scrollRef, scrollToBottom, isAtBottom } = useStickToBottom();

  return (
    <AIChatScrollerContext.Provider value={{ scrollToBottom, isAtBottom }}>
      {/* scrollRef: container externo com overflow-y-auto */}
      <div
        ref={scrollRef}
        className={cn(
          'scrollbar-none min-h-0 flex-1 overflow-y-auto',
          className
        )}
      >
        {/* contentRef: div interno que cresce com as mensagens */}
        <div
          ref={contentRef}
          className={cn('flex flex-col gap-3 px-4 py-4', contentClassName)}
        >
          {children}
        </div>
      </div>
    </AIChatScrollerContext.Provider>
  );
}
