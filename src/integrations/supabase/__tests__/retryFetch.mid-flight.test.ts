/**
 * Regressão BUG-D — retryFetch mid-flight abort (caminho crítico)
 *
 * Fix em client.ts L730-797: registra listener no AbortSignal do caller APÓS
 * o acquire. O listener chama _releaseSupabaseSlot() imediatamente quando o
 * signal aborta — sem esperar o fetch retornar (até 12-15s).
 *
 * Para regredir: comentar linhas 730-797 de client.ts. O teste "inFlight
 * cai de 1→0" falharia (inFlight ficaria 1 até o fetch completar).
 *
 * Diferença dos outros testes de semáforo: este exercita retryFetch
 * diretamente (onde o listener está), não apenas acquireSupabaseSlot.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { retryFetch, getSupabaseSemaphoreState } from '../client';

const NON_AUTH_URL = 'http://localhost:54321/rest/v1/test_retryFetch_mid_flight';

/** Helper: cria mock de fetch controlável (resolve/reject na mão). */
function makeControllableFetch() {
  let settle: ((r: Response | PromiseLike<Response>) => void) | undefined;
  let settleReject: ((e: unknown) => void) | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
    return new Promise<Response>((resolve, reject) => {
      settle = resolve;
      settleReject = reject;
      // Rejeita também se o signal interno do boundedFetch disparar
      // (para evitar que o timer de 12s segure o teste se algo der errado)
      const sig = (init as RequestInit)?.signal;
      if (sig?.aborted) { reject(new DOMException('pre-aborted', 'AbortError')); return; }
      sig?.addEventListener('abort', () => {
        reject(new DOMException('internal-timeout-abort', 'AbortError'));
      }, { once: true });
    });
  });
  return {
    resolveNow: (status = 200) =>
      settle?.(new Response(JSON.stringify([]), { status })),
    rejectNow: (err = new DOMException('test-abort', 'AbortError')) =>
      settleReject?.(err),
  };
}

describe('retryFetch — BUG-D regression: slot release mid-flight abort', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    // Drena microtasks residuais
    for (let i = 0; i < 20; i++) await Promise.resolve();
    // Invariante final: sem slot leak
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TESTE 1 — caminho crítico: slot liberado MID-FLIGHT
  // ---------------------------------------------------------------------------
  it('inFlight cai de 1→0 imediatamente ao abortar mid-flight (core BUG-D)', async () => {
    const { resolveNow } = makeControllableFetch();
    const ctrl = new AbortController();

    // Inicia fetch sem await (retryFetch começa a executar sincronamente)
    const promise = retryFetch(NON_AUTH_URL, { signal: ctrl.signal }).catch(() => {});

    // Drena microtasks para que retryFetch passe do await acquire e registre o listener
    await Promise.resolve(); // acquire resolve → retryFetch continua
    await Promise.resolve(); // callerSignal.addEventListener registrado
    await Promise.resolve(); // withRetry inicia → mockFetch é chamado

    expect(getSupabaseSemaphoreState().inFlight).toBe(1);

    // — PONTO CRÍTICO DO BUG-D —
    // ctrl.abort() dispara o listener 'abort' SINCRONAMENTE.
    // releaseOnCallerAbort() → _releaseSupabaseSlot() → inFlight--.
    ctrl.abort();

    // BUG-D (antes fix): inFlight = 1 (slot preso até fetch completar ~12s)
    // BUG-D (após fix):  inFlight = 0 (slot liberado no mesmo tick do abort)
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);

    // Resolve o mock para que withRetry complete e o teste não seja cancelado
    resolveNow();
    await promise;
  });

  // ---------------------------------------------------------------------------
  // TESTE 2 — waiter na fila é promovido quando o in-flight slot é liberado
  // ---------------------------------------------------------------------------
  it('waiter desbloqueado imediatamente quando in-flight slot é liberado por abort', async () => {
    const { resolveNow } = makeControllableFetch();
    const ctrl1 = new AbortController();

    // Ocupa 1 slot via retryFetch
    const promise1 = retryFetch(NON_AUTH_URL, { signal: ctrl1.signal }).catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().inFlight).toBe(1);

    // Ocupa os 7 slots restantes via acquireSupabaseSlot
    const { acquireSupabaseSlot } = await import('../client');
    const extras: Array<() => void> = [];
    for (let i = 0; i < 7; i++) extras.push(await acquireSupabaseSlot());
    expect(getSupabaseSemaphoreState().inFlight).toBe(8); // semáforo cheio

    // Enfileira um waiter
    let waiterDone = false;
    const waiterPromise = acquireSupabaseSlot().then((release) => {
      waiterDone = true;
      release();
    });
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(1);

    // Abort do 1º request → slot liberado imediatamente
    ctrl1.abort();

    // Waiter é promovido na mesma passagem de microtasks
    await Promise.resolve(); // promoção do waiter
    await Promise.resolve();
    expect(waiterDone).toBe(true); // waiter adquiriu e liberou o slot

    // Cleanup
    for (const rel of extras) rel();
    resolveNow();
    await promise1;
    await waiterPromise;
  });

  // ---------------------------------------------------------------------------
  // TESTE 3 — double-release guard (callerAbortedSlot flag)
  // ---------------------------------------------------------------------------
  it('abortar DEPOIS do fetch retornar não causa double-release (inFlight ≥ 0)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    const ctrl = new AbortController();

    // Fetch completa normalmente — finally libera o slot via !callerAbortedSlot
    await retryFetch(NON_AUTH_URL, { signal: ctrl.signal }).catch(() => {});
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);

    // Abort tardio: o listener tenta chamar releaseOnCallerAbort mas
    // callerAbortedSlot=false e _supabaseInFlight já é 0 →
    // a flag interna de idempotência do release deve evitar inFlight < 0
    ctrl.abort();
    await Promise.resolve();

    // inFlight não pode ser negativo (invariante do semáforo)
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
  });
});
