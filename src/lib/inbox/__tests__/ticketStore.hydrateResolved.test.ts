// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testa a hidratação do overlay de tickets a partir da fonte durável
 * (`conversation_closures`). O ticketStore usa cache de módulo, então cada
 * teste recarrega o módulo com `vi.resetModules()` para garantir estado limpo.
 */
describe('ticketStore.hydrateResolved', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  async function loadStore() {
    const { ticketStore } = await import('@/lib/inbox/ticketStore');
    return ticketStore;
  }

  it('hidrata contatos ausentes como resolved', async () => {
    const store = await loadStore();
    store.hydrateResolved(['a', 'b']);
    const snap = store.snapshot();
    expect(snap['a']?.status).toBe('resolved');
    expect(snap['b']?.status).toBe('resolved');
  });

  it('promove contato em open (default de bootstrap) para resolved', async () => {
    const store = await loadStore();
    store.bootstrap('a');
    expect(store.snapshot()['a']?.status).toBe('open');

    store.hydrateResolved(['a']);
    expect(store.snapshot()['a']?.status).toBe('resolved');
  });

  it('respeita estado local in_progress (reopen real) — não sobrescreve', async () => {
    const store = await loadStore();
    store.assign('a', 'agent-1', null); // open → in_progress
    expect(store.snapshot()['a']?.status).toBe('in_progress');

    store.hydrateResolved(['a']);
    expect(store.snapshot()['a']?.status).toBe('in_progress');
  });

  it('ignora ids vazios sem alterar o overlay', async () => {
    const store = await loadStore();
    store.hydrateResolved(['', null as unknown as string, undefined as unknown as string]);
    expect(Object.keys(store.snapshot())).toEqual([]);
  });
});
