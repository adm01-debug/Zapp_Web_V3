/**
 * Regressao do loop infinito de auto-reconnect (console de producao 2026-09-02).
 *
 * Sintoma: com a instancia wpp2 caida, o log
 *   "Giving up on wpp2: N consecutive reconnect attempts failed"
 * saia a cada ~60s com N subindo sem parar (20 -> 57 na sessao capturada).
 * Causa: scheduleNextAttempt parava de agendar o proprio timer ao bater
 * MAX_CONSECUTIVE_RECONNECT_ATTEMPTS, mas o setInterval de 30s do checkStatus
 * continuava re-disparando attemptSpecificReconnect — cada disparo reentrava no
 * ramo de "giving up", gerando um evento Sentry ate o tunnel responder 429.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// vi.mock é içado acima das declarações do módulo — as refs precisam vir de
// vi.hoisted para existirem quando a factory do mock roda.
const { logError, logInfo, connectInstance, getInstanceStatus, restartInstance, emit } = vi.hoisted(
  () => ({
    logError: vi.fn(),
    logInfo: vi.fn(),
    connectInstance: vi.fn(async () => ({})),
    getInstanceStatus: vi.fn(async () => ({ instance: { state: 'close' } })),
    restartInstance: vi.fn(async () => ({})),
    emit: vi.fn(),
  })
);

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    error: logError,
    warn: vi.fn(),
    info: logInfo,
    debug: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ connectInstance, getInstanceStatus, restartInstance }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
  };
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() } };
});

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { rpc: vi.fn(async () => ({ data: null, error: null })) },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/lib/eventBus', () => ({ eventBus: { emit } }));

import { useEvolutionAutoReconnect } from '@/hooks/useEvolutionAutoReconnect';

/** Avanca timers fake resolvendo microtasks entre cada passo. */
async function advance(ms: number, step = 1_000): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await vi.advanceTimersByTimeAsync(step);
  }
}

describe('useEvolutionAutoReconnect — latch de esgotamento', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logInfo.mockClear();
    emit.mockClear();
    connectInstance.mockClear();
    getInstanceStatus.mockClear();
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'close' } }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('para de tentar (e loga "Giving up" UMA vez) depois do limite de tentativas', async () => {
    renderHook(() => useEvolutionAutoReconnect('wpp2'));

    // ~15min: muito alem das 20 tentativas com backoff no teto de 60s.
    await advance(15 * 60_000);

    const givingUp = logError.mock.calls.filter((c) => String(c[0]).includes('Giving up on wpp2'));
    expect(givingUp).toHaveLength(1);

    const exhausted = emit.mock.calls.filter((c) => c[0] === 'connection:reconnect-exhausted');
    expect(exhausted).toHaveLength(1);

    // Depois do latch, mais 10min de polling nao podem gerar novas tentativas.
    const attemptsAfterLatch = connectInstance.mock.calls.length;
    await advance(10 * 60_000);
    expect(connectInstance.mock.calls.length).toBe(attemptsAfterLatch);
  });

  it('rearma o ciclo quando a instancia volta a um estado nao-desconectado', async () => {
    renderHook(() => useEvolutionAutoReconnect('wpp2'));
    await advance(15 * 60_000);
    expect(
      logError.mock.calls.filter((c) => String(c[0]).includes('Giving up on wpp2'))
    ).toHaveLength(1);

    // Instancia reconectada por fora (re-pareamento manual / recuperacao).
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'open' } }));
    await advance(2 * 60_000);
    expect(logInfo.mock.calls.some((c) => String(c[0]).includes('Reconnect re-armado'))).toBe(true);

    // Cai de novo: o auto-reconnect precisa voltar a agir.
    const before = connectInstance.mock.calls.length;
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'close' } }));
    await advance(2 * 60_000);
    expect(connectInstance.mock.calls.length).toBeGreaterThan(before);
  });
});
