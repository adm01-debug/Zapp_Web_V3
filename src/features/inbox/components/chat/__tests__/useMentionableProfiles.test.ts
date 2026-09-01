/**
 * G3 — Testes dedicados para useMentionableProfiles (P16/E66 + B3)
 * Cobre: select correto, dados corretos, propagação de erro (B3), placeholderData.
 *
 * Armadilhas resolvidas:
 *   1. vi.mock() hoisted — usar vi.hoisted() para variáveis de controle
 *   2. vi.clearAllMocks() NÃO limpa mockResolvedValue — usar mockLimit.mockReset()
 *   3. retry:2 no hook briga com retry:false do QueryClient (per-query override)
 *      → solução: retryDelay:0 para tornar retries instantâneos
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { mockLimit, mockSelect, mockFrom } = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const mockSelect = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockLimit, mockSelect, mockFrom };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

import { useMentionableProfiles } from '../../../hooks/useMentionableProfiles';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // retry:false não sobrepõe o retry:2 do hook (per-query tem precedência),
        // mas retryDelay:0 → retries instantâneos, testes não ficam lentos
        retry: false,
        retryDelay: 0,
        gcTime: 0,
      },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { Wrapper, queryClient };
}

describe('useMentionableProfiles', () => {
  beforeEach(() => {
    // mockReset limpa: implementação + calls + results
    // É mais forte que clearAllMocks (que só limpa calls/results)
    mockLimit.mockReset();
  });

  it('select correto: from("profiles") → select(...) → limit(50)', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    const { Wrapper } = makeWrapper();
    renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    await waitFor(() => expect(mockLimit).toHaveBeenCalledWith(50));
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockSelect).toHaveBeenCalledWith('id, name, email, avatar_url');
  });

  it('retorna AgentMention[] quando Supabase retorna dados', async () => {
    const profiles = [
      { id: 'u1', name: 'Alice', email: 'a@test.com', avatar_url: null },
      { id: 'u2', name: 'Bob', email: 'b@test.com', avatar_url: null },
    ];
    mockLimit.mockResolvedValue({ data: profiles, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    // isSuccess é imediatamente true quando placeholderData está ativo.
    // Aguardar o dado real: data.length > 0 (diferente do placeholder=[])
    await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0));
    expect(result.current.data).toEqual(profiles);
  });

  it('B3 FIX — error Supabase → isError=true após retries', async () => {
    const err = { message: 'RLS violation: permission denied' };
    mockLimit.mockResolvedValue({ data: null, error: err });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    // retry:2 com retryDelay:0 — deve marcar error em < 500ms
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe(err.message);
    expect(result.current.isSuccess).toBe(false);
  });

  it('B3 FIX — data NUNCA é [] silencioso quando há error (o resultado é erro)', async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: 'Timeout' } });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    // Usar isError diretamente — !isLoading pode ser imediatamente true com placeholderData
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
    expect(result.current.isSuccess).toBe(false);
  });

  it('placeholderData=[] → data=[]] no estado inicial (query carregando)', () => {
    mockLimit.mockReturnValue(new Promise(() => {})); // nunca resolve

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('queryKey é ["mention-profiles"] sem colisão', () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    const { Wrapper, queryClient } = makeWrapper();
    renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    const queries = queryClient.getQueriesData({ queryKey: ['mention-profiles'] });
    expect(queries.length).toBeGreaterThan(0);
  });
});
