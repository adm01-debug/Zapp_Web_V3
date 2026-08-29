import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVirtualRows } from '@/features/inbox/hooks/useVirtualRows';

interface VirtualizerInput {
  count: number;
  getScrollElement: () => HTMLElement | null;
  estimateSize: (index: number) => number;
  overscan?: number;
  measureElement: (element: HTMLElement) => number;
  scrollMargin: number;
}

const { useVirtualizerMock, virtualItems, virtualizer } = vi.hoisted(() => {
  const virtualItems = [{ key: 'row-0', index: 0, start: 0, end: 36, size: 36, lane: 0 }];
  const virtualizer = {
    getVirtualItems: vi.fn(() => virtualItems),
    getTotalSize: vi.fn(() => 72),
  };

  return {
    useVirtualizerMock: vi.fn((_options: VirtualizerInput) => virtualizer),
    virtualItems,
    virtualizer,
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: useVirtualizerMock,
}));

describe('useVirtualRows', () => {
  let resizeCallback: ResizeObserverCallback | undefined;
  let observeMock: ReturnType<typeof vi.fn>;
  let disconnectMock: ReturnType<typeof vi.fn>;
  let restoreOffsetTop: (() => void) | undefined;

  beforeEach(() => {
    useVirtualizerMock.mockClear();
    virtualizer.getVirtualItems.mockClear();
    virtualizer.getTotalSize.mockClear();
    observeMock = vi.fn();
    disconnectMock = vi.fn();
    resizeCallback = undefined;
    restoreOffsetTop = undefined;

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = observeMock;
      unobserve = vi.fn();
      disconnect = disconnectMock;
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    restoreOffsetTop?.();
    vi.unstubAllGlobals();
  });

  it('configures the virtualizer and exposes its derived state', () => {
    const estimateSize = vi.fn(() => 36);
    const { result } = renderHook(() =>
      useVirtualRows({ items: ['first', 'second'], estimateSize })
    );

    const options = useVirtualizerMock.mock.calls[useVirtualizerMock.mock.calls.length - 1]?.[0];

    expect(options).toMatchObject({
      count: 2,
      estimateSize,
      overscan: 10,
      scrollMargin: 0,
    });
    expect(options?.getScrollElement()).toBeNull();

    const measuredRow = document.createElement('div');
    vi.spyOn(measuredRow, 'getBoundingClientRect').mockReturnValue({ height: 42 } as DOMRect);
    expect(options?.measureElement(measuredRow)).toBe(42);
    expect(result.current.virtualizer).toBe(virtualizer);
    expect(result.current.virtualItems).toBe(virtualItems);
    expect(result.current.totalSize).toBe(72);
  });

  it('measures the list offset and disconnects observation on unmount', () => {
    let offsetTop = 24;
    const offsetTopSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(() => offsetTop);
    restoreOffsetTop = () => offsetTopSpy.mockRestore();

    function Probe() {
      const rows = useVirtualRows({
        items: ['first'],
        estimateSize: () => 36,
        overscan: 4,
      });

      return (
        <div ref={rows.scrollContainerRef} data-testid="scroll-container">
          <div
            ref={rows.listStartRef}
            data-testid="list-start"
            data-scroll-margin={rows.scrollMargin}
          />
        </div>
      );
    }

    const { unmount } = render(<Probe />);
    const container = screen.getByTestId('scroll-container');

    expect(observeMock).toHaveBeenCalledWith(container);
    expect(screen.getByTestId('list-start')).toHaveAttribute('data-scroll-margin', '24');

    offsetTop = 48;
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });

    expect(screen.getByTestId('list-start')).toHaveAttribute('data-scroll-margin', '48');
    const latestOptions =
      useVirtualizerMock.mock.calls[useVirtualizerMock.mock.calls.length - 1]?.[0];
    expect(latestOptions).toMatchObject({
      count: 1,
      overscan: 4,
      scrollMargin: 48,
    });

    unmount();
    expect(disconnectMock).toHaveBeenCalledOnce();
  });
});
