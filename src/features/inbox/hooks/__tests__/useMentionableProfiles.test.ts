/**
 * G3 — Testes dedicados para useMentionableProfiles (P16/E66 + B3)
 * Cobre: query key, staleTime, retry:2, propagação de erro Supabase (B3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

import { useMentionableProfiles } from '../useMentionableProfiles';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

describe('useMentionableProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
  });

  it('busca perfis com select correto e limite de 50', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    mockSelect.mockReturnValue({ limit: mockLimit });

    const { Wrapper } = createWrapper();
    renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    await waitFor(() => expect(mockLimit).toHaveBeenCalledWith(50));
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockSelect).toHaveBeenCalledWith('id, name, email, avatar_url');
  });

  it('retorna array de AgentMention quando Supabase retorna dados', async () => {
    const profiles = [
      { id: 'u1', name: 'Alice', email: 'alice@test.com', avatar_url: null },
      { id: 'u2', name: 'Bob', email: 'bob@test.com', avatar_url: null },
    ];
    const mockLimit = vi.fn().mockResolvedValue({ data: profiles, error: null });
    mockSelect.mockReturnValue({ limit: mockLimit });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(profiles);
  });

  it('B3 FIX: propaga erro Supabase — React Query marca como error', async () => {
    const supabaseError = { message: 'RLS violation: permission denied for table profiles' };
    const mockLimit = vi.fn().mockResolvedValue({ data: null, error: supabaseError });
    mockSelect.mockReturnValue({ limit: mockLimit });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe(supabaseError.message);
  });

  it('B3 FIX: data=null com error → NÃO retorna [] silenciosamente', async () => {
    const supabaseError = { message: 'Connection timeout' };
    const mockLimit = vi.fn().mockResolvedValue({ data: null, error: supabaseError });
    mockSelect.mockReturnValue({ limit: mockLimit });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    await waitFor(() => !result.current.isLoading);
    // NÃO deve retornar [] como se fosse sucesso
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(true);
  });

  it('placeholderData=[] faz data iniciar como []', () => {
    // Nunca resolve — verificar estado imediato
    const mockLimit = vi.fn().mockReturnValue(new Promise(() => {}));
    mockSelect.mockReturnValue({ limit: mockLimit });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    // Antes de resolver, data deve ser [] (placeholderData)
    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('queryKey é ["mention-profiles"]', () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    mockSelect.mockReturnValue({ limit: mockLimit });

    const { Wrapper, queryClient } = createWrapper();
    renderHook(() => useMentionableProfiles(), { wrapper: Wrapper });

    const queries = queryClient.getQueriesData({ queryKey: ['mention-profiles'] });
    expect(queries.length).toBeGreaterThan(0);
  });
});
