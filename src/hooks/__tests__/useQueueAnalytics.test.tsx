import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Estratégia: useQueueAnalytics é pura transformação — delega fetching para
 * useQueueAnalyticsManagement. Mockamos o hook base e testamos a lógica de
 * transformação diretamente (sem await, sem mock de banco de dados).
 */

const mockUseQueueAnalyticsManagement = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useQueueManagement', () => ({
  useQueueAnalyticsManagement: (...args: unknown[]) =>
    mockUseQueueAnalyticsManagement(...args),
}));

import { useQueueAnalytics } from '@/hooks/useQueueAnalytics';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const dateRange = {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-07'),
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const sampleAnalytics = {
  queue_id: 'q1',
  total_messages: 120,
  average_response_time: 300,
  first_response_time: 60,
  resolution_rate: 75,
  customer_satisfaction: 4.2,
  timestamp: '2024-01-05T10:00:00Z',
};

describe('useQueueAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQueueAnalyticsManagement.mockReturnValue({
      analytics: sampleAnalytics,
      loading: false,
      refetch: vi.fn(),
    });
  });

  it('loading=false quando analytics resolvido', () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    expect(result.current.loading).toBe(false);
  });

  it('dailyData tem 1 entrada com dados reais quando há analytics', () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    expect(result.current.dailyData.length).toBe(1);
    expect(result.current.dailyData[0].messages).toBe(120);
    expect(result.current.dailyData[0].mensagens).toBe(120);
  });

  it('hourlyData tem entrada "Atual" com total_messages quando há analytics', () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    expect(result.current.hourlyData.length).toBe(1);
    expect(result.current.hourlyData[0].hour).toBe('Atual');
    expect(result.current.hourlyData[0].hora).toBe('Atual');
    expect(result.current.hourlyData[0].messages).toBe(120);
  });

  it('statusData tem 2 itens com valores corretos e cores HSL semânticas', () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });

    expect(result.current.statusData).toHaveLength(2);

    const resolvidas = result.current.statusData.find((s) => s.name === 'Resolvidas');
    const pendentes = result.current.statusData.find((s) => s.name === 'Pendentes');
    expect(resolvidas?.value).toBe(75);
    expect(pendentes?.value).toBe(25); // 100 - 75
    expect(resolvidas?.color).toContain('hsl(var(--');
    expect(pendentes?.color).toContain('hsl(var(--');
  });

  it('agentPerformance é sempre array vazio', () => {
    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    expect(result.current.agentPerformance).toHaveLength(0);
  });

  it('sem analytics (null) → dailyData com placeholders, statusData e hourlyData vazios', () => {
    mockUseQueueAnalyticsManagement.mockReturnValue({
      analytics: null,
      loading: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    // buildDailyPlaceholders gera uma entrada por dia (01/01–07/01 = 7 dias)
    expect(result.current.dailyData.length).toBe(7);
    expect(result.current.dailyData[0].messages).toBe(0);
    expect(result.current.statusData).toHaveLength(0);
    expect(result.current.hourlyData).toHaveLength(0);
  });

  it('loading=true propagado enquanto analytics não resolveu', () => {
    mockUseQueueAnalyticsManagement.mockReturnValue({
      analytics: null,
      loading: true,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useQueueAnalytics('q1', dateRange), {
      wrapper: createWrapper(),
    });
    expect(result.current.loading).toBe(true);
    // Sem analytics → placeholders
    expect(result.current.dailyData.length).toBe(7);
    expect(result.current.statusData).toHaveLength(0);
  });

  it('dateRange legado (startDate/endDate) também gera placeholders corretos', () => {
    mockUseQueueAnalyticsManagement.mockReturnValue({
      analytics: null,
      loading: false,
      refetch: vi.fn(),
    });

    const legacyRange = { startDate: new Date('2024-01-01'), endDate: new Date('2024-01-03') };
    const { result } = renderHook(() => useQueueAnalytics('q1', legacyRange), {
      wrapper: createWrapper(),
    });
    // 01/01, 02/01, 03/01 = 3 dias
    expect(result.current.dailyData.length).toBe(3);
    expect(result.current.dailyData[0].messages).toBe(0);
  });
});
