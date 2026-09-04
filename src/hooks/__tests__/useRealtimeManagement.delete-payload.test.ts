/**
 * Regressao: payload de DELETE no Realtime (useRealtimeDashboardManagement).
 *
 * O Supabase Realtime entrega `payload.new = {}` em eventos DELETE — objeto
 * vazio, portanto truthy. Com isso `payload.new ?? payload.old` NUNCA cai no
 * fallback, e o update do dashboard chegava com `data: {}` e um `id` sintetico
 * de Date.now() em vez da linha removida (que vem em `payload.old`).
 *
 * Mesma classe de bug ja corrigida em useRealtimeContacts (FIX C3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockChannel = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/integrations/supabase/channelErrorLogging', () => ({
  logChannelError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useRealtimeDashboardManagement } from '@/hooks/useRealtimeManagement';

type PgPayload = {
  eventType: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

/** Captura o handler de postgres_changes registrado pelo hook. */
let handler: ((p: PgPayload) => void) | undefined;

beforeEach(() => {
  handler = undefined;
  mockChannel.mockReset();
  mockRemoveChannel.mockReset();

  const channel = {
    on: vi.fn((_event: string, _filter: unknown, cb: (p: PgPayload) => void) => {
      handler = cb;
      return channel;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      cb?.('SUBSCRIBED');
      return channel;
    }),
    unsubscribe: vi.fn(),
  };
  mockChannel.mockReturnValue(channel);
});

describe('useRealtimeDashboardManagement — payload de DELETE', () => {
  it('usa payload.old no DELETE, mesmo com new = {} (truthy)', () => {
    const { result } = renderHook(() => useRealtimeDashboardManagement('dash-1'));
    expect(handler).toBeTypeOf('function');

    act(() => {
      handler!({
        eventType: 'DELETE',
        new: {}, // é isso que o Realtime manda em DELETE
        old: { id: 'notif-42', title: 'removida' },
      });
    });

    expect(result.current.updates).toHaveLength(1);
    const [update] = result.current.updates;

    // Antes do fix: data === {} e id === String(Date.now())
    expect(update.data).toEqual({ id: 'notif-42', title: 'removida' });
    expect(update.id).toBe('notif-42');
    expect(update.type).toBe('DELETE');
  });

  it('mantem payload.new em INSERT e UPDATE', () => {
    const { result } = renderHook(() => useRealtimeDashboardManagement('dash-1'));

    act(() => {
      handler!({ eventType: 'INSERT', new: { id: 'n-1' }, old: {} });
    });
    act(() => {
      handler!({ eventType: 'UPDATE', new: { id: 'n-2' }, old: { id: 'n-2' } });
    });

    expect(result.current.updates.map((u) => u.id)).toEqual(['n-1', 'n-2']);
  });

  it('cai para Date.now() quando new e old vem ambos vazios', () => {
    const { result } = renderHook(() => useRealtimeDashboardManagement('dash-1'));

    act(() => {
      handler!({ eventType: 'DELETE', new: {}, old: {} });
    });

    expect(result.current.updates).toHaveLength(1);
    expect(result.current.updates[0].data).toEqual({});
    expect(result.current.updates[0].id).toMatch(/^\d+$/);
  });
});
