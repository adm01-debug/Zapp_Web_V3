import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = vi.hoisted(() => vi.fn());

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: mockLogger,
  logger: mockLogger,
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  generateRequestTag: vi.fn(() => 'req-test'),
  generateCorrelationId: vi.fn(() => 'corr-test'),
  getSessionId: vi.fn(() => 'session-test'),
  logPerformance: vi.fn(),
  logAsyncPerformance: vi.fn(),
  Logger: class LoggerMock {},
}));

import { useExternalContact360BatchRef } from '@/hooks/useExternalApiManagement';

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function cleanPhone(phone: string) {
  return phone.replace(/[^0-9]/g, '');
}

function batchRefKey(phones: string[]) {
  const cleaned = [...new Set(phones.map(cleanPhone).filter((p) => p.length >= 8))];
  return ['external-contact-360-batch-ref', cleaned.sort().join(',')] as const;
}

function contact360(phone: string, label: string) {
  return {
    found: true,
    searched_phone: phone,
    company: { nome_fantasia: label },
    contact: { relationship_score: 70 },
    rfm: { segment_code: 'gold' },
    customer: null,
    stakeholder: null,
    contact_social: [],
    company_social: [],
    contact_phones: [],
    contact_emails: [],
    company_phones: [],
    company_emails: [],
    company_address: null,
    contact_interactions: [],
  };
}

function makeBuilder(mode: 'resolve' | 'hold', payload: unknown) {
  let signalRef: AbortSignal | undefined;
  const abortSignalSpy = vi.fn();
  const builder = {
    abortSignal: (s: AbortSignal) => {
      signalRef = s;
      abortSignalSpy(s);
      return builder;
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) => {
      const p = new Promise((resolve) => {
        const abortError = () => {
          const e = new Error('The operation was aborted.');
          e.name = 'AbortError';
          resolve({ data: null, error: e });
        };
        if (signalRef?.aborted) {
          abortError();
          return;
        }
        signalRef?.addEventListener('abort', abortError, { once: true });
        if (mode === 'resolve') {
          setTimeout(() => resolve({ data: payload, error: null }), 5);
        }
      });
      return p.then(onFulfilled, onRejected);
    },
  };
  return { builder, abortSignalSpy, getSignal: () => signalRef };
}

describe('useExternalContact360BatchRef — abort e troca de lotes', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.clearAllMocks();
  });

  it('propaga AbortSignal ao dbRpc e cancela silenciosamente sem cachear mapa vazio', async () => {
    const payload = {
      results: [
        {
          phone: '5511912345678',
          found: true,
          contact: contact360('5511912345678', 'ACME'),
        },
      ],
    };
    const { builder, abortSignalSpy, getSignal } = makeBuilder('hold', payload);
    mockRpc.mockReturnValue(builder);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useExternalContact360BatchRef(['5511912345678']), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(abortSignalSpy).toHaveBeenCalledTimes(1));
    const captured = getSignal();
    expect(captured).toBeInstanceOf(AbortSignal);
    expect(captured?.aborted).toBe(false);

    queryClient.cancelQueries({ queryKey: batchRefKey(['5511912345678']) });
    await waitFor(() => expect(captured?.aborted).toBe(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeUndefined();
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(batchRefKey(['5511912345678']))).toBeUndefined();
  });

  it('troca de lote mantém só a interseção no placeholder até B resolver', async () => {
    const payloadA = {
      results: [
        {
          phone: '5511988888888',
          found: true,
          contact: contact360('5511988888888', 'BETA A'),
        },
        {
          phone: '5511912345678',
          found: true,
          contact: contact360('5511912345678', 'ACME A'),
        },
      ],
    };
    const payloadB = {
      results: [
        {
          phone: '5511988888888',
          found: true,
          contact: contact360('5511988888888', 'BETA B'),
        },
        {
          phone: '5511977777777',
          found: true,
          contact: contact360('5511977777777', 'GAMMA B'),
        },
      ],
    };

    const first = makeBuilder('resolve', payloadA);
    let resolveB!: (value: unknown) => void;
    const pendingAbortSignalSpy = vi.fn(() => pendingB);
    const pendingB = {
      abortSignal: pendingAbortSignalSpy,
      then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
        new Promise((resolve) => {
          resolveB = resolve;
        }).then(onFulfilled, onRejected),
    };
    mockRpc.mockReturnValueOnce(first.builder).mockReturnValueOnce(pendingB);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ phones }: { phones: string[] }) => useExternalContact360BatchRef(phones),
      {
        initialProps: { phones: ['5511988888888', '5511912345678'] },
        wrapper: makeWrapper(queryClient),
      }
    );

    await waitFor(() =>
      expect(result.current.data?.get('5511988888888')?.company?.nome_fantasia).toBe('BETA A')
    );
    expect(result.current.data?.get('5511912345678')?.company?.nome_fantasia).toBe('ACME A');

    rerender({ phones: ['5511988888888', '5511977777777'] });

    await waitFor(() => expect(pendingAbortSignalSpy).toHaveBeenCalledTimes(1));
    expect(result.current.data?.get('5511988888888')?.company?.nome_fantasia).toBe('BETA A');
    expect(result.current.data?.get('5511912345678')).toBeUndefined();
    expect(result.current.data?.get('5511977777777')).toBeUndefined();

    resolveB({ data: payloadB, error: null });
    await waitFor(() =>
      expect(result.current.data?.get('5511988888888')?.company?.nome_fantasia).toBe('BETA B')
    );

    expect(result.current.data?.get('5511912345678')).toBeUndefined();
    expect(result.current.data?.get('5511977777777')?.company?.nome_fantasia).toBe('GAMMA B');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
