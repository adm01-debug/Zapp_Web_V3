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
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { ScrollFade } from '@/components/ui/scroll-fade';
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
}

/**
 * Container de scroll virtualizado desacoplado.
 * Ativado via featureFlag `chat_scroller_v2`.
 */
export const ChatScrollerV2 = forwardRef<ChatScrollerV2Handle, ChatScrollerV2Props>(
  function ChatScrollerV2(
    { messages, estimateSize, renderItem, header, className, overscan = 10, onNearTop },
    ref
  ) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const listStartRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const [atBottom, setAtBottom] = useState(true);

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

        <ScrollFade atBottom={atBottom} />
      </div>
    );
  }
);
