import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.hoisted(() => vi.fn());
// Referência estável — nova instância a cada render quebraria useCallback/useEffect
const mockUser = vi.hoisted(() => ({ id: 'u-test' }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger');
vi.mock('@/features/auth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, session: null })),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn(() => ({ user: mockUser })) }));

import { useQueueGoals } from '@/hooks/useQueueGoals';

const mockGoals = [
  {
    id: 'g1',
    queue_id: 'q1',
    max_waiting_contacts: 10,
    max_avg_wait_minutes: 5,
    min_assignment_rate: 80,
    max_messages_pending: 50,
    alerts_enabled: true,
  },
  {
    id: 'g2',
    queue_id: 'q2',
    max_waiting_contacts: 20,
    max_avg_wait_minutes: 10,
    min_assignment_rate: 70,
    max_messages_pending: 100,
    alerts_enabled: false,
  },
];

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useQueueGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: mockGoals, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('fetches goals on mount', async () => {
    const { result } = renderHook(() => useQueueGoals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.goals).toHaveLength(2);
  });

  it('maps goals by queue_id', async () => {
    const { result } = renderHook(() => useQueueGoals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const q1 = result.current.goals.find((g) => g.queue_id === 'q1');
    expect(q1).toBeDefined();
    expect(q1?.max_waiting_contacts).toBe(10);
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    });

    const { result } = renderHook(() => useQueueGoals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('exposes saveGoal function', async () => {
    const { result } = renderHook(() => useQueueGoals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.saveGoal).toBe('function');
  });

  it('exposes getDefaultGoal function', async () => {
    const { result } = renderHook(() => useQueueGoals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.getDefaultGoal).toBe('function');
  });

  it('getDefaultGoal returns sensible defaults', async () => {
    const { result } = renderHook(() => useQueueGoals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const defaults = result.current.getDefaultGoal();
    expect(defaults.max_waiting_contacts).toBeGreaterThan(0);
  });

  it('goals can be accessed by queue_id', async () => {
    const { result } = renderHook(() => useQueueGoals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.goals.find((g) => g.queue_id === 'q1')?.id).toBe('g1');
    expect(result.current.goals.find((g) => g.queue_id === 'unknown')).toBeUndefined();
  });

  it('handles empty goals', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const { result } = renderHook(() => useQueueGoals(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.goals).toHaveLength(0);
  });
});
