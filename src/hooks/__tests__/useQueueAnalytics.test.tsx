import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/lib/logger');
vi.mock('@/features/auth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u-test' }, session: null })),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn(() => ({ user: { id: 'u-test' } })) }));

import { useQueueAnalytics } from '@/hooks/useQueueAnalytics';

const dateRange = {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-07'),
};

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useQueueAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'c1', assigned_to: 'p1', created_at: '2024-01-03' },
                { id: 'c2', assigned_to: null, created_at: '2024-01-04' },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'm1',
                      contact_id: 'c1',
                      sender: 'agent',
                      created_at: '2024-01-03T10:00:00Z',
                    },
                    {
                      id: 'm2',
                      contact_id: 'c1',
                      sender: 'contact',
                      created_at: '2024-01-03T11:00:00Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'p1', name: 'Agent 1' }],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('fetches analytics data', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('returns daily data array', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.dailyData)).toBe(true);
  });

  it('returns hourly data array', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.hourlyData)).toBe(true);
  });

  it('returns status data', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.statusData)).toBe(true);
  });

  it('returns agent performance', async () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.agentPerformance)).toBe(true);
  });

  it('handles empty queue (no contacts)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dailyData.length).toBeGreaterThan(0); // empty daily placeholders
  });

  it('handles fetch error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    });

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('initializes with loading true', async () => {
    // Precisa de Promise controlada: com mockResolvedValue o mock resolve em
    // microtasks e o happy-dom pode executar effects síncronamente durante
    // renderHook(), zerando loading antes de qualquer leitura.
    let resolveQuery!: () => void;
    const pendingPromise = new Promise<{ data: unknown[]; error: null }>((res) => {
      resolveQuery = () => res({ data: [], error: null });
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'queue_analytics') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockReturnValue(pendingPromise),
                }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    expect(result.current.loading).toBe(true);
    resolveQuery();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('status data uses semantic HSL colors', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.statusData.forEach((s) => {
      // Colors are now semantic HSL tokens like 'hsl(var(--primary))'
      expect(s.color).toContain('hsl(var(--');
      expect(s.name).toBeTruthy();
    });
  });
});
