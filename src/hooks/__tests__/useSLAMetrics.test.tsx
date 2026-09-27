import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/lib/logger');

import { useSLAMetrics } from '@/features/sla/hooks/useSLAMetrics';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockRPCResult = {
  overall: {
    firstResponse: { total: 2, onTime: 1, breached: 1, rate: 50 },
    resolution: { total: 2, onTime: 1, breached: 1, rate: 50 },
    totalConversations: 2,
    overallRate: 50,
  },
  byAgent: [
    {
      agentId: 'a1',
      agentName: 'Agente 1',
      avatarUrl: null,
      firstResponse: { total: 1, onTime: 1, breached: 0, rate: 100 },
      resolution: { total: 1, onTime: 1, breached: 0, rate: 100 },
      overallRate: 100,
    },
  ],
  startAt: '2026-09-06T00:00:00Z',
  period: 'today',
  computedAt: '2026-09-06T12:00:00Z',
};

describe('useSLAMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: mockRPCResult, error: null });
  });

  it('fetches SLA metrics via rpc_sla_dashboard', async () => {
    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
    expect(mockRpc).toHaveBeenCalledWith('rpc_sla_dashboard', { p_period: 'today' });
  });

  it('passes the correct period to the RPC', async () => {
    const { result } = renderHook(() => useSLAMetrics('month'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith('rpc_sla_dashboard', { p_period: 'month' });
  });

  it('handles loading state correctly', () => {
    mockRpc.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(true);
  });

  it('handles empty byAgent gracefully', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...mockRPCResult,
        byAgent: [],
        overall: {
          firstResponse: { total: 0, onTime: 0, breached: 0, rate: 100 },
          resolution: { total: 0, onTime: 0, breached: 0, rate: 100 },
          totalConversations: 0,
          overallRate: 100,
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.overall.totalConversations).toBe(0);
    expect(result.current.data?.byAgent).toHaveLength(0);
  });

  it('handles RPC errors gracefully (data remains null)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('RPC error') });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
  });

  it('rejects malformed RPC payload via runtime guard', async () => {
    // Payload sem `overall` objeto e com `byAgent` não-array — o guard deve
    // rejeitar e a query deve falhar em vez de vazar dados incompletos.
    mockRpc.mockResolvedValue({ data: { overall: null, byAgent: 'not-an-array' }, error: null });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
  });

  it('rejects null RPC payload via runtime guard', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
  });

  it('returns overall metrics from RPC result', async () => {
    const { result } = renderHook(() => useSLAMetrics('week'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.overall.firstResponse.total).toBe(2);
    expect(result.current.data?.overall.firstResponse.onTime).toBe(1);
    expect(result.current.data?.overall.firstResponse.breached).toBe(1);
    expect(result.current.data?.byAgent).toHaveLength(1);
    expect(result.current.data?.byAgent[0]?.agentId).toBe('a1');
  });

  it('uses server-side period calculation — no browser new Date()', () => {
    // The hook must NOT import date-fns or use new Date() for period → date.
    // It delegates entirely to rpc_sla_dashboard(p_period).
    // Verify: only one argument group passed to rpc (period string, no ISO date).
    renderHook(() => useSLAMetrics('all'), { wrapper: createWrapper() });

    expect(mockRpc).toHaveBeenCalledWith('rpc_sla_dashboard', { p_period: 'all' });
    // If a browser-side date were computed, a second argument with a date string would appear.
    expect(mockRpc).not.toHaveBeenCalledWith(
      'rpc_sla_dashboard',
      expect.objectContaining({ start_at: expect.anything() })
    );
  });
});
