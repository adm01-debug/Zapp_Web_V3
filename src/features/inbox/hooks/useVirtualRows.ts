/**
 * E53 — useVirtualRows: lógica comum de virtualização (inbox + team-chat).
 * Encapsula useVirtualizer com estimateSize, overscan e scrollMargin.
 */
import { useRef, useLayoutEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface UseVirtualRowsOptions<T> {
  items: T[];
  estimateSize: (index: number) => number;
  overscan?: number;
}

export function useVirtualRows<T>({
  items,
  estimateSize,
  overscan = 10,
}: UseVirtualRowsOptions<T>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listStartRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const el = listStartRef.current;
    const container = scrollContainerRef.current;
    if (!el || !container) return;
    const measure = () => setScrollMargin(el.offsetTop);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length > 0]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan,
    measureElement: (el) => el.getBoundingClientRect().height,
    scrollMargin,
  });

  return {
    scrollContainerRef,
    listStartRef,
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    scrollMargin,
  };
}
