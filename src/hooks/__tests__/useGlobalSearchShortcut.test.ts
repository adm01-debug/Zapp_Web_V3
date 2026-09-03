import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGlobalSearchShortcut } from '@/hooks/useGlobalSearchShortcut';

describe('useGlobalSearchShortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onOpen when Ctrl+K pressed', async () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut({ onOpen }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
  });

  it('calls onOpen when Cmd+K pressed', async () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut({ onOpen }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    });
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
  });

  it('does not call onOpen for plain K', () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut({ onOpen }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not call onOpen for Ctrl+other key', () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut({ onOpen }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('cleans up event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useGlobalSearchShortcut({ onOpen: vi.fn() }));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
