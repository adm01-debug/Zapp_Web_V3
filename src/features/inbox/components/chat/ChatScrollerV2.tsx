/**
 * E46-E48 — ChatScrollerV2: wrapper de scroll virtualizado ativado pela flag
 * `chat_scroller_v2`. Encapsula o container + virtualizer, expondo API mínima.
 *
 * Quando a flag estiver habilitada, ChatMessagesArea delega o scroll a este
 * componente em vez de gerenciar inline. Enquanto disabled (padrão), o código
 * original em ChatMessagesArea permanece intacto.
 */
import {
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useLayoutEffect,
  useState,
  useEffect,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { ArrowDown } from 'lucide-react';
import { type Message } from '@/types/chat';

export interface ChatScrollerV2Handle {
  scrollToBottom: () => void;
  scrollToIndex: (index: number) => void;
  getScrollContainer: () => HTMLDivElement | null;
}

interface ChatScrollerV2Props {
  messages: Message[];
  /** Estimativa de altura por índice. */
  estimateSize: (index: number) => number;
  /** Renderiza um item virtual. */
  renderItem: (message: Message, index: number) => React.ReactNode;
  /** Renderiza conteúdo estático acima da lista (watermark, banner). */
  header?: React.ReactNode;
  className?: string;
  /** overscan — padrão 10. */
  overscan?: number;
  onNearTop?: () => void;
  /** Número de mensagens novas fora da janela visível (P03). */
  newMessageCount?: number;
  /** Callback disparado quando o estado atBottom muda (P03). */
  onAtBottomChange?: (atBottom: boolean) => void;
}

/**
 * Container de scroll virtualizado desacoplado.
 * Ativado via featureFlag `chat_scroller_v2`.
 */
export const ChatScrollerV2 = forwardRef<ChatScrollerV2Handle, ChatScrollerV2Props>(
  function ChatScrollerV2(
    {
      messages,
      estimateSize,
      renderItem,
      header,
      className,
      overscan = 10,
      onNearTop,
      newMessageCount = 0,
      onAtBottomChange,
    },
    ref
  ) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const listStartRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const [atBottom, setAtBottom] = useState(true);

    // P03: notifica o pai quando atBottom muda (debounced 100ms)
    useEffect(() => {
      const timer = setTimeout(() => {
        onAtBottomChange?.(atBottom);
      }, 100);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [atBottom]);

    // scrollMargin — offset entre topo do container e início do bloco virtual
    useLayoutEffect(() => {
      const el = listStartRef.current;
      const container = scrollContainerRef.current;
      if (!el || !container) return;
      const measure = () => setScrollMargin(el.offsetTop);
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(container);
      return () => ro.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- expressão primitiva (bool), seguro
    }, [messages.length > 0]);

    const virtualizer = useVirtualizer({
      count: messages.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize,
      overscan,
      measureElement: (el) => el.getBoundingClientRect().height,
      scrollMargin,
    });

    const handleScroll = useCallback(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      setAtBottom(scrollHeight - scrollTop - clientHeight < 80);
      if (scrollTop < 600 && onNearTop) onNearTop();
    }, [onNearTop]);

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        const c = scrollContainerRef.current;
        if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
      },
      scrollToIndex: (index: number) => {
        virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
      },
      getScrollContainer: () => scrollContainerRef.current,
    }));

    const virtualItems = virtualizer.getVirtualItems();

    return (
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={cn('relative flex-1 overflow-y-auto overscroll-none', className)}
      >
        {header}

        <div ref={listStartRef} />

        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualItems.map((vRow) => {
            const msg = messages[vRow.index];
            if (!msg) return null;
            return (
              <div
                key={vRow.key}
                data-index={vRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vRow.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                {renderItem(msg, vRow.index)}
              </div>
            );
          })}
        </div>

        {/* P03: NewMessageIndicator — flutua acima do scroll quando há mensagens novas */}
        {!atBottom && newMessageCount > 0 && (
          <button
            type="button"
            className="animate-bounce-once absolute bottom-14 right-4 z-20 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              const c = scrollContainerRef.current;
              if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
            }}
            aria-label={`${newMessageCount} nova${newMessageCount !== 1 ? 's' : ''} mensagem${newMessageCount !== 1 ? 's' : ''} — pular para o fim`}
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{newMessageCount > 99 ? '99+' : newMessageCount}</span>
          </button>
        )}

        <ScrollFade atBottom={atBottom} />
      </div>
    );
  }
);
