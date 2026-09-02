/**
 * Regressão BUG-D (commit 652f8bf9d, 2026-08-24):
 *
 * Antes do fix: quando um componente React desmontava enquanto um request já
 * havia adquirido um slot do semáforo (estava in-flight), o slot ficava preso
 * até a resposta chegar (ou o timeout de 12s do boundedFetch). Com 8 slots e
 * ~12 requests por painel de contato, 2 trocas rápidas de contato podiam
 * saturar completamente a fila (documentado em cbb45aedc como "decisão
 * pendente — boundedFetch descarta o AbortSignal após o slot ser adquirido").
 *
 * Fix aplicado em retryFetch (client.ts, commit 652f8bf9d):
 *   - Ao receber o signal do caller, adiciona listener de 'abort'
 *   - O listener chama _releaseSupabaseSlot() imediatamente
 *   - Flag booleana `callerAbortedSlot` previne double-release
 *
 * Testa diretamente acquireSupabaseSlot (invariante do semáforo).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  acquireSupabaseSlot,
  getSupabaseSemaphoreState,
} from '../client';

describe('acquireSupabaseSlot — slot release mid-flight (BUG-D regression)', () => {
  const releases: Array<() => void> = [];

  beforeEach(() => {
    releases.length = 0;
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  afterEach(async () => {
    vi.useRealTimers();
    let guard = 0;
    while (
      (getSupabaseSemaphoreState().inFlight > 0 ||
        getSupabaseSemaphoreState().queueLength > 0) &&
      guard++ < 64
    ) {
      const release = releases.shift();
      if (release) release();
      await Promise.resolve();
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  const acquireTracked = async (
    priority?: 'normal' | 'high',
    signal?: AbortSignal | null
  ): Promise<() => void> => {
    const release = await acquireSupabaseSlot(priority, signal);
    releases.push(release);
    return release;
  };

  it('liberar slot manual drena o waiter da fila sem deadlock', async () => {
    for (let i = 0; i < 7; i++) {
      await acquireTracked();
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(7);

    const inFlightRelease = await acquireTracked('normal');
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);

    const waiterPromise = acquireTracked('normal');
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(1);

    // Simula: componente desmonta, retryFetch chama release() via finally
    inFlightRelease();
    await Promise.resolve();

    const waiterRelease = await waiterPromise;
    releases.push(waiterRelease);
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  it('release() idempotente: chamar duas vezes não corrompe inFlight', async () => {
    const release = await acquireTracked();
    expect(getSupabaseSemaphoreState().inFlight).toBe(1);

    release();
    release(); // 2ª chamada: no-op pela flag interna de idempotência

    await Promise.resolve();
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
  });

  it('N releases consecutivos desbloqueiam N waiters sem deadlock', async () => {
    const inFlightReleases: Array<() => void> = [];
    for (let i = 0; i < 8; i++) {
      const rel = await acquireSupabaseSlot('normal');
      inFlightReleases.push(rel);
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);

    const waiterPromises = [acquireTracked(), acquireTracked(), acquireTracked()];
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(3);

    for (const rel of inFlightReleases) {
      rel();
      await Promise.resolve();
    }

    const waiterReleases = await Promise.all(waiterPromises);
    for (const wr of waiterReleases) releases.push(wr);

    expect(getSupabaseSemaphoreState().inFlight).toBe(3);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  it('signal pré-abortado rejeita imediato sem consumir slot', async () => {
    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);

    const ctrl = new AbortController();
    ctrl.abort();

    await expect(
      acquireSupabaseSlot('normal', ctrl.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });
});
