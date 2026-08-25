import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockSelect = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockSingle = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
          maybeSingle: mockSingle, // hook usa .maybeSingle()
        }),
      }),
    })),
  },
}));

// Mock useAuth
const mockUser = { id: 'user-123' };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

import { useDownloadPermission } from '@/hooks/useDownloadPermission';
import { useAuth } from '@/hooks/useAuth';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        // initialData é setado pelo hook — sobrescrever aqui não funciona.
        // A solução é não ter initialData no wrapper, e usar initialData: undefined no hook durante testes.
        // Na prática: o hook tem initialData: false + staleTime: 5min.
        // Ao forçar staleTime: 0 no cliente, a query roda mesmo com initialData.
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useDownloadPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: mockUser });
  });

  it('retorna false por padrão quando perfil não encontrado', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.canDownload).toBe(false));
  });

  it('retorna true quando can_download é true no perfil', async () => {
    mockSingle.mockResolvedValue({ data: { can_download: true }, error: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    // initialData: false no hook faz isLoading=false imediatamente com valor false.
    // Com staleTime:0 no cliente, a query refetch ocorre logo após o mount.
    await waitFor(() => expect(result.current.canDownload).toBe(true), { timeout: 3000 });
  });

  it('retorna false quando can_download é false no perfil', async () => {
    mockSingle.mockResolvedValue({ data: { can_download: false }, error: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.canDownload).toBe(false));
  });

  it('retorna false quando can_download é null (fallback seguro)', async () => {
    mockSingle.mockResolvedValue({ data: { can_download: null }, error: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.canDownload).toBe(false));
  });

  it('retorna false quando não há usuário autenticado', async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    expect(result.current.canDownload).toBe(false);
  });

  it('retorna false em caso de erro na query do Supabase', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'network error' } });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.canDownload).toBe(false));
  });

  it('consulta a tabela profiles com user_id correto', async () => {
    mockSingle.mockResolvedValue({ data: { can_download: true }, error: null });

    const { result } = renderHook(() => useDownloadPermission(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.canDownload).toBe(true), { timeout: 3000 });
    expect(mockSelect).toHaveBeenCalledWith('can_download');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
  });
});
