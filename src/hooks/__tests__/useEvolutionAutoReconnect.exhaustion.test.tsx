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
import { renderHook, act } from '@testing-library/react';

// vi.mock é içado acima das declarações do módulo — as refs precisam vir de
// vi.hoisted para existirem quando a factory do mock roda.
const {
  logError, logInfo, logWarn, connectInstance, getInstanceStatus, restartInstance, emit,
  capturedPgCallback,
} = vi.hoisted(() => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  connectInstance: vi.fn(async () => ({})),
  getInstanceStatus: vi.fn(async () => ({ instance: { state: 'close' } })),
  restartInstance: vi.fn(async () => ({})),
  emit: vi.fn(),
  mockQueryClient: { invalidateQueries: vi.fn() },
  capturedPgCallback: { current: null as ((payload: unknown) => void) | null },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    error: logError,
    warn: logWarn,
    info: logInfo,
    debug: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ connectInstance, getInstanceStatus, restartInstance }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: vi.fn((event: string, _filter: unknown, cb: (payload: unknown) => void) => {
      // Captura o callback do postgres_changes para uso nos testes F-01
      if (event === 'postgres_changes') capturedPgCallback.current = cb;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
  };
  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    },
  };
});

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { rpc: vi.fn(async () => ({ data: null, error: null })) },
}));

vi.mock('@tanstack/react-query', () => {
  // Objeto estável: se fosse recriado a cada render, queryClient mudaria de
  // referência, invalidando o useCallback que depende dele e re-disparando
  // useEffect([checkStatus]) — o que limparia o timer de backoff e quebraria
  // o loop de tentativas antes de atingir MAX_CONSECUTIVE_RECONNECT_ATTEMPTS.
  const qc = { invalidateQueries: vi.fn() };
  return { useQueryClient: () => qc };
});

vi.mock('@/lib/eventBus', () => ({ eventBus: { emit } }));

vi.mock('@/hooks/evolutionAutoReconnectState', () => ({
  isConclusiveEvolutionDisconnect: vi.fn((s: string) => s === 'close'),
}));

import { useEvolutionAutoReconnect } from '@/hooks/useEvolutionAutoReconnect';

/** Avanca timers fake drenando toda a cadeia de microtasks em um unico passo. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useEvolutionAutoReconnect — latch de esgotamento', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logInfo.mockClear();
    logWarn.mockClear();
    emit.mockClear();
    connectInstance.mockClear();
    getInstanceStatus.mockClear();
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'close' } }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    'para de tentar (e loga "Giving up" UMA vez) depois do limite de tentativas',
    { timeout: 60_000 },
    async () => {
      renderHook(() => useEvolutionAutoReconnect('wpp2'));

      // ~22min: backoff cresce 4s→8s→16s→32s→60s (teto) + 5s de execucao por
      // tentativa. As 20 tentativas levam ~19min; 22min garante margem.
      await advance(22 * 60_000);

      const givingUp = logError.mock.calls.filter((c) =>
        String(c[0]).includes('Giving up on wpp2')
      );
      expect(givingUp).toHaveLength(1);

      const exhausted = emit.mock.calls.filter((c) => c[0] === 'connection:reconnect-exhausted');
      expect(exhausted).toHaveLength(1);

      // Depois do latch, mais 10min de polling nao podem gerar novas tentativas.
      const attemptsAfterLatch = connectInstance.mock.calls.length;
      await advance(10 * 60_000);
      expect(connectInstance.mock.calls.length).toBe(attemptsAfterLatch);
    }
  );

  it(
    'checkStatus continua acionando tentativas apos o backoff timer disparar (regressao B-2)',
    { timeout: 60_000 },
    async () => {
      // Garante que timerRef.current e zerado dentro do callback do setTimeout,
      // evitando que o guard "isReconnectingRef || reconnectExhaustedRef" (sem
      // timerRef) bloqueie o checkStatus de re-entrar apos cada backoff disparar.
      renderHook(() => useEvolutionAutoReconnect('wpp2'));

      // Avanca 90s: tempo suficiente para 1 tentativa inicial (checkStatus ~30s)
      // + backoff inicial (5s) disparar + checkStatus acionar 2a tentativa.
      await advance(90_000);
      // Se B-2 regredisse, checkStatus ficaria mudo apos o 1o backoff timer
      // e connectInstance seria chamado apenas 1x. Com o fix, deve haver >= 2.
      expect(connectInstance.mock.calls.length).toBeGreaterThanOrEqual(2);
    }
  );

  it(
    'rearma o ciclo quando a instancia volta a um estado nao-desconectado',
    { timeout: 60_000 },
    async () => {
      renderHook(() => useEvolutionAutoReconnect('wpp2'));
      await advance(22 * 60_000);
      expect(
        logError.mock.calls.filter((c) => String(c[0]).includes('Giving up on wpp2'))
      ).toHaveLength(1);

      // Instancia reconectada por fora (re-pareamento manual / recuperacao).
      getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'open' } }));
      await advance(2 * 60_000);
      expect(logInfo.mock.calls.some((c) => String(c[0]).includes('Reconnect re-armado'))).toBe(
        true
      );

      // Cai de novo: o auto-reconnect precisa voltar a agir.
      const before = connectInstance.mock.calls.length;
      getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'close' } }));
      await advance(2 * 60_000);
      expect(connectInstance.mock.calls.length).toBeGreaterThan(before);
    }
  );
});

describe('useEvolutionAutoReconnect — regressao timerRef no success path', () => {
  /**
   * Regressao do bug HOOK-001 (auditoria P100 2026-09-02):
   * apos reconexao bem-sucedida, timerRef.current nao era zerado.
   * Na proxima queda, o guard `timerRef.current !== null` bloqueava o ciclo
   * indefinidamente — o hook ficava mudo mesmo com a instancia caida.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logInfo.mockClear();
    emit.mockClear();
    connectInstance.mockClear();
    getInstanceStatus.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reinicia ciclo de reconexao apos sucesso seguido de nova queda (regressao HOOK-001)', async () => {
    // Sequencia de retornos que reproduz o bug HOOK-001:
    //   #1  checkStatus → 'close' → dispara 1ª tentativa
    //   #2  (dentro da 1ª tentativa, pós-connectInstance+5s) → 'close'
    //       → scheduleNextAttempt (backoff=4s) → timerRef.current ≠ null   ← ponto crítico
    //   #3  (dentro da 2ª tentativa, disparada pelo backoff timer) → 'open'
    //       → sucesso, timerRef.current = null (fix HOOK-001)
    //   #4+ checkStatus (30s) → 'close' → SEM fix: timerRef!=null bloqueia
    //                                      COM fix: timerRef==null → nova tentativa
    let callCount = 0;
    getInstanceStatus.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 3) return { instance: { state: 'open' } };
      return { instance: { state: 'close' } };
    });

    renderHook(() => useEvolutionAutoReconnect('wpp2'));

    // ~20s: checkStatus(t=0) + 1ª tentativa (t=0→5s, backoff 4s) + 2ª tentativa (t=9s→14s) → sucesso
    await advance(20_000);
    expect(connectInstance.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(logInfo.mock.calls.some((c) => String(c[0]).includes('Successfully reconnected'))).toBe(
      true
    );

    const afterFirstSuccess = connectInstance.mock.calls.length;

    // Mais 35s: checkStatus em t=30s detecta 'close' de novo.
    // SEM o fix HOOK-001: timerRef.current !== null → guard bloqueia, connectInstance NÃO é chamado.
    // COM o fix HOOK-001: timerRef.current === null → nova tentativa dispara normalmente.
    await advance(35_000);
    expect(connectInstance.mock.calls.length).toBeGreaterThan(afterFirstSuccess);
  });

  it('resetReconnect apos latch dispara nova tentativa sem timer fantasma', async () => {
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'close' } }));

    const { result } = renderHook(() => useEvolutionAutoReconnect('wpp2'));

    // Esgota o latch (~22min)
    await advance(22 * 60_000);
    const afterExhaustion = connectInstance.mock.calls.length;
    expect(logError.mock.calls.some((c) => String(c[0]).includes('Giving up on wpp2'))).toBe(true);

    // Sem resetReconnect, nenhuma tentativa extra
    await advance(2 * 60_000);
    expect(connectInstance.mock.calls.length).toBe(afterExhaustion);

    // resetReconnect limpa timer e reinicia ciclo imediatamente
    await act(async () => {
      result.current.resetReconnect();
    });
    await advance(2_000);
    expect(connectInstance.mock.calls.length).toBeGreaterThan(afterExhaustion);
  });
});

describe('useEvolutionAutoReconnect — staleness de geração A→B→A', () => {
  /**
   * Regressão do bug A→B→A (2026-09-03):
   * O guard de nome sozinho ficava cego quando a instância voltava ao valor
   * original: capturedInstance === instanceNameRef.current === 'A', mas
   * capturedGeneration havia sido capturado no ciclo 1 enquanto
   * instanceGenerationRef já estava no ciclo 3. O contador de geração
   * (instanceGenerationRef) distingue os dois ciclos de 'A'.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logInfo.mockClear();
    emit.mockClear();
    connectInstance.mockClear();
    getInstanceStatus.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('descarta resultado de connectInstance pendente após troca A→B→A (dual guard)', async () => {
    // 1ª chamada a getInstanceStatus retorna 'close' → dispara reconnect do ciclo 1 de A.
    // Demais retornam 'open' → ciclo B e novo ciclo de A não iniciam reconexão.
    getInstanceStatus
      .mockResolvedValueOnce({ instance: { state: 'close' } })
      .mockResolvedValue({ instance: { state: 'open' } });

    // 1ª chamada a connectInstance fica pendente até resolvermos manualmente.
    let resolveFirstConnect!: () => void;
    connectInstance.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolveFirstConnect = () => resolve({});
        })
    );
    connectInstance.mockResolvedValue({});

    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useEvolutionAutoReconnect(name),
      { initialProps: { name: 'instA' } }
    );

    // checkStatus(t=0) → 'close' → attemptSpecificReconnect → connectInstance PENDENTE
    await advance(200);
    expect(connectInstance).toHaveBeenCalledTimes(1);
    expect(connectInstance).toHaveBeenCalledWith('instA');

    // A→B: instanceGenerationRef sobe para 1; B→A: sobe para 2.
    await act(async () => {
      rerender({ name: 'instB' });
    });
    await act(async () => {
      rerender({ name: 'instA' });
    });

    // Resolve connectInstance do ciclo 1 de 'instA'.
    // Dual guard: capturedGeneration(0) !== instanceGenerationRef.current(2) → return.
    await act(async () => {
      resolveFirstConnect();
    });
    // Avança 6s (> 5s do setTimeout interno do hook) para que uma op obsoleta
    // que escapasse do dual guard tivesse tempo de chamar getInstanceStatus e
    // emitir 'connection:recovered'. Com o guard ativo, o stale op retorna
    // imediatamente após connectInstance resolver — nada é emitido.
    await advance(6_000);

    // NÃO deve emitir connection:recovered (op antiga descartada pelo dual guard)
    expect(emit.mock.calls.filter((c) => c[0] === 'connection:recovered')).toHaveLength(0);

    // NÃO deve logar "Successfully reconnected" pela op antiga
    expect(logInfo.mock.calls.some((c) => String(c[0]).includes('Successfully reconnected'))).toBe(
      false
    );

    // isReconnecting deve ser false (resetado pelos switches de instância)
    expect(result.current.isReconnecting).toBe(false);
  });
});

describe('useEvolutionAutoReconnect — proteção de circuito', () => {
  /**
   * TEST-004: credentialErrorRef — halt permanente em 401/403.
   * TEST-005: circuit breaker — backoff exponencial após CIRCUIT_THRESHOLD falhas
   *           consecutivas no loop de polling (checkStatus).
   *
   * Constantes do hook (verificadas em 2026-09-03):
   *   CIRCUIT_THRESHOLD = 3
   *   CIRCUIT_BASE_MS   = 120_000  (2 min — primeira janela de cooldown)
   *   CIRCUIT_MAX_MS    = 600_000  (10 min — teto)
   */
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logInfo.mockClear();
    logWarn.mockClear();
    emit.mockClear();
    connectInstance.mockClear();
    connectInstance.mockImplementation(async () => ({}));
    getInstanceStatus.mockClear();
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'close' } }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([401, 403])(
    'para o ciclo permanentemente quando connectInstance retorna HTTP %i (credential error)',
    async (httpStatus) => {
      // Primeira chamada a connectInstance lança credencial inválida;
      // chamadas subsequentes resolveriam normalmente — mas não devem ocorrer.
      connectInstance.mockRejectedValueOnce({ status: httpStatus });

      renderHook(() => useEvolutionAutoReconnect('wpp2'));

      // checkStatus (imediato) detecta 'close' → despacha attemptSpecificReconnect
      // (fire-and-forget) → connectInstance lança 401/403 → credentialErrorRef = true
      // + eventBus.emit('connection:credential-error')
      await advance(2_000);

      const credErrors = emit.mock.calls.filter((c) => c[0] === 'connection:credential-error');
      expect(credErrors).toHaveLength(1);
      expect(credErrors[0][1]).toMatchObject({ instanceName: 'wpp2', status: httpStatus });

      // Pelo menos uma tentativa (a que falhou) deve ter sido feita.
      const callsAfterCred = connectInstance.mock.calls.length;
      expect(callsAfterCred).toBeGreaterThanOrEqual(1);

      // Guard 1 em checkStatus bloqueia toda execução subsequente —
      // nem getInstanceStatus é chamado novamente, nem connectInstance.
      await advance(5 * 60_000);
      expect(connectInstance.mock.calls.length).toBe(callsAfterCred);

      // O halt é permanente: nenhum novo evento de credential-error fica enfileirado.
      expect(emit.mock.calls.filter((c) => c[0] === 'connection:credential-error')).toHaveLength(1);
    }
  );

  it('abre o circuit breaker apos CIRCUIT_THRESHOLD falhas consecutivas no checkStatus', async () => {
    // getInstanceStatus lança erro transitório (503) em todas as chamadas.
    // Isso faz o loop de polling (checkStatus) acumular falhas sem jamais
    // chamar attemptSpecificReconnect.
    getInstanceStatus.mockRejectedValue({ status: 503 });

    renderHook(() => useEvolutionAutoReconnect('wpp2'));

    // Três ciclos de polling: t=0 (imediato), t=30s, t=60s.
    // Na 3ª falha (t=60s): consecutiveFailsRef >= CIRCUIT_THRESHOLD(3) →
    // circuitOpenUntilRef = t + CIRCUIT_BASE_MS = 60_000 + 120_000 = 180_000.
    await advance(65_000);
    expect(getInstanceStatus.mock.calls.length).toBe(3);
    expect(logWarn.mock.calls.some((c) => String(c[0]).includes('Circuit breaker opened'))).toBe(
      true
    );

    // Dentro da janela de cooldown: intervalo em t=90s bloqueado pelo Guard 2.
    await advance(30_000); // t=95s
    expect(getInstanceStatus.mock.calls.length).toBe(3);

    // Após o cooldown (circuito fecha em t=180s):
    // intervalo em t=180s passa pelo Guard 2 → nova chamada a getInstanceStatus.
    // Cobre t=120s (bloqueado), t=150s (bloqueado), t=180s (passa).
    await advance(100_000); // t=195s
    expect(getInstanceStatus.mock.calls.length).toBeGreaterThan(3);
  });

  it('resetReconnect zera circuitOpenUntilRef e credentialErrorRef — retomada imediata', async () => {
    // Aciona credentialErrorRef via connectInstance 401.
    connectInstance.mockRejectedValueOnce({ status: 401 });

    const { result } = renderHook(() => useEvolutionAutoReconnect('wpp2'));
    await advance(2_000);

    // Credential error ativado — polling bloqueado.
    const callsAfterCred = connectInstance.mock.calls.length;
    await advance(60_000);
    expect(connectInstance.mock.calls.length).toBe(callsAfterCred);

    // resetReconnect zera credentialErrorRef (e circuitOpenUntilRef) →
    // attemptSpecificReconnect disparado imediatamente.
    // Desta vez connectInstance não rejeita → chamada extra acontece.
    await act(async () => {
      result.current.resetReconnect();
    });
    await advance(2_000);
    expect(connectInstance.mock.calls.length).toBeGreaterThan(callsAfterCred);
  });
});

// F-02: credential errors (HTTP 401/403) em checkStatus para o polling permanentemente
describe('useEvolutionAutoReconnect — credential error em checkStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logWarn.mockClear();
    emit.mockClear();
    getInstanceStatus.mockClear();
    connectInstance.mockClear();
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'close' } }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([401, 403])(
    'HTTP %i em getInstanceStatus para o polling permanentemente (credentialErrorRef)',
    async (httpStatus) => {
      getInstanceStatus.mockRejectedValueOnce({ status: httpStatus });

      renderHook(() => useEvolutionAutoReconnect('wpp2'));
      // Deixa o primeiro ciclo de checkStatus disparar (~2s)
      await advance(2_000);

      // O evento de credential error deve ter sido emitido
      expect(emit.mock.calls.some((c) => c[0] === 'connection:credential-error')).toBe(true);

      // A partir daqui o polling deve ter parado — congelar contagem
      const callsAfterError = getInstanceStatus.mock.calls.length;
      await advance(120_000);
      expect(getInstanceStatus.mock.calls.length).toBe(callsAfterError);
    },
  );
});

describe('useEvolutionAutoReconnect — timerRef.current = null no callback (mutante M4)', () => {
  /**
   * Testa que timerRef.current é zerado DENTRO do callback do setTimeout,
   * não apenas no success/failure path de attemptSpecificReconnect.
   *
   * Por que isso importa: quando a instanceName muda enquanto um timer de
   * backoff está pendente, o callback dispara mas o guard de capturedInstance
   * retorna cedo (early-return). Sem o `timerRef.current = null` no callback,
   * a referência fica "fantasma" (fired timer handle, non-null) e o checkStatus
   * seguinte é bloqueado pelo guard `timerRef.current !== null` → o novo ciclo
   * da instância B nunca começa.
   *
   * Cenário que o mutante "remover timerRef.current = null do callback" quebra:
   *   1. Instância 'instA' começa ciclo → scheduleNextAttempt (backoff 4s)
   *   2. Antes do timer disparar, prop muda para 'instB'
   *   3. Timer dispara: capturedInstance='instA' ≠ 'instB' → early return
   *   4. SEM fix: timerRef ainda aponta para o timer disparado (stale non-null)
   *   5. checkStatus de 'instB' detecta 'close' mas timerRef !== null → BLOQUEADO
   *   6. COM fix: timerRef = null no callback → checkStatus livre para reagendar
   */
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logInfo.mockClear();
    emit.mockClear();
    connectInstance.mockClear();
    getInstanceStatus.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('zera timerRef no callback ao trocar instanceName: evita timer-handle fantasma', async () => {
    // instA começa em 'close'; instB também retorna 'close'.
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'close' } }));

    // Primeira chamada a connectInstance fica suspensa até resolvermos — garante
    // que o backoff de 4s está pendente quando mudamos de instA para instB.
    let resolveFirst!: () => void;
    connectInstance.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>((r) => {
          resolveFirst = () => r({});
        })
    );
    // Demais chamadas resolvem imediatamente.
    connectInstance.mockResolvedValue({});

    const { rerender } = renderHook(
      ({ name }: { name: string }) => useEvolutionAutoReconnect(name),
      { initialProps: { name: 'instA' } }
    );

    // t=0: checkStatus detecta 'close' para 'instA', dispara 1ª tentativa
    await advance(1_000);
    expect(connectInstance.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Avança além do ATTEMPT_WAIT (5 s) para scheduleNextAttempt criar o timer de backoff (4 s).
    // Apenas assim timerRef.current é não-nulo ANTES da mudança de instância.
    resolveFirst();
    await advance(6_000); // ATTEMPT_WAIT (5 s) + getInstanceStatus → timerRef.current = handle 4 s

    // Muda para instB COM o backoff timer de instA já pendente em timerRef.current
    rerender({ name: 'instB' });
    await advance(500);

    // O backoff timer de instA dispara — capturedInstance='instA' ≠ instanceNameRef='instB'
    // COM fix (M4): timerRef.current = null antes do early-return → guard de checkStatus passa.
    // SEM fix: timerRef.current permanece handle expirado → guard bloqueia checkStatus de 'instB'.
    await advance(4_500); // dispara o backoff de 4 s

    const callsBeforeCheckStatus = connectInstance.mock.calls.length;

    // checkStatus de 'instB' detecta 'close'; COM fix → nova tentativa para 'instB'.
    await advance(30_000);

    expect(connectInstance.mock.calls.length).toBeGreaterThan(callsBeforeCheckStatus);
    const extraCalls = connectInstance.mock.calls.slice(callsBeforeCheckStatus);
    expect(extraCalls.length).toBeGreaterThan(0);
    expect((extraCalls[0] as unknown[])[0]).toBe('instB');
  });
});

// F-01: performReconnect disparada via evento Realtime (postgres_changes UPDATE)
describe('useEvolutionAutoReconnect — performReconnect via Realtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logInfo.mockClear();
    logWarn.mockClear();
    emit.mockClear();
    restartInstance.mockClear();
    connectInstance.mockClear();
    getInstanceStatus.mockClear();
    capturedPgCallback.current = null;
    restartInstance.mockImplementation(async () => ({}));
    getInstanceStatus.mockImplementation(async () => ({ instance: { state: 'open' } }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invoca restartInstance quando UPDATE em whatsapp_connections sinaliza desconexao', async () => {
    renderHook(() => useEvolutionAutoReconnect('wpp2'));
    // Deixa o useEffect montar e registrar o channel
    await advance(100);
    expect(capturedPgCallback.current).not.toBeNull();

    // Simula payload de UPDATE: connected → disconnected
    await act(async () => {
      capturedPgCallback.current?.({
        new: {
          instance_id: 'inst-001',
          status: 'disconnected',
          health_reason: null,
          auto_reconnect_enabled: true,
          loop_protection_active: false,
        },
        old: { status: 'connected' },
      });
    });
    await advance(5_000);

    expect(restartInstance.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('ignora UPDATE quando auto_reconnect_enabled e false', async () => {
    renderHook(() => useEvolutionAutoReconnect('wpp2'));
    await advance(100);

    await act(async () => {
      capturedPgCallback.current?.({
        new: {
          instance_id: 'inst-001',
          status: 'disconnected',
          health_reason: null,
          auto_reconnect_enabled: false,
          loop_protection_active: false,
        },
        old: { status: 'connected' },
      });
    });
    await advance(5_000);

    expect(restartInstance.mock.calls.length).toBe(0);
  });

  it('ignora UPDATE quando loop_protection_active e true', async () => {
    renderHook(() => useEvolutionAutoReconnect('wpp2'));
    await advance(100);

    await act(async () => {
      capturedPgCallback.current?.({
        new: {
          instance_id: 'inst-001',
          status: 'disconnected',
          health_reason: null,
          auto_reconnect_enabled: true,
          loop_protection_active: true,
        },
        old: { status: 'connected' },
      });
    });
    await advance(5_000);

    expect(restartInstance.mock.calls.length).toBe(0);
  });
});

// F-04-TEST: mountedRef guard — setState não chamado após unmount
describe('useEvolutionAutoReconnect — mountedRef guard (sem setState pós-unmount)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logError.mockClear();
    logWarn.mockClear();
    emit.mockClear();
    getInstanceStatus.mockClear();
    connectInstance.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nao chama setState quando o componente e desmontado durante getInstanceStatus pendente', async () => {
    // Cria uma promise controlável — getInstanceStatus não resolve até liberarmos
    let resolvePending!: (v: { instance: { state: string } }) => void;
    const pending = new Promise<{ instance: { state: string } }>((res) => { resolvePending = res; });
    getInstanceStatus.mockImplementationOnce(() => pending);

    const { unmount } = renderHook(() => useEvolutionAutoReconnect('wpp2'));

    // Inicia o primeiro ciclo de checkStatus (~0s) mas não avança timers
    // para que a promise ainda esteja pendente quando desmontarmos
    await act(async () => {
      // Avança apenas o suficiente para o useEffect montar (sem disparar intervalos)
      await vi.advanceTimersByTimeAsync(0);
    });

    // Desmonta o hook enquanto getInstanceStatus ainda está pendente
    unmount();

    // Resolve a promise APÓS o unmount — o guard mountedRef.current deve bloquear setStatus
    // React 18 não lança erro para setState pós-unmount, mas logError não deve ser emitido
    await act(async () => {
      resolvePending({ instance: { state: 'close' } });
      await vi.advanceTimersByTimeAsync(100);
    });

    // O guard mountedRef.current deve ter bloqueado qualquer continuação:
    // — getInstanceStatus chamado exatamente 1× (antes do unmount, nunca depois)
    // — nenhum evento 'connection:recovered' emitido
    expect(getInstanceStatus).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalledWith('connection:recovered', expect.anything());
  });
});
