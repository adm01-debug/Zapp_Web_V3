import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';

/**
 * E71 — ProtectedRoute agora verifica AAL2 antes de liberar qualquer rota
 * protegida (achado da auditoria adversarial do plano canônico, 2026-09-02):
 * antes deste fix, uma sessão persistida em aal1 (2FA cadastrado mas não
 * elevado nesta sessão — ex.: reload direto numa rota protegida, sem passar
 * pela tela /auth) acessava normalmente, sem jamais completar o desafio.
 */

const mockUseAuth = vi.hoisted(() => ({ useAuth: vi.fn() }));
const mockUseRouteRoles = vi.hoisted(() => ({ useRouteRoles: vi.fn() }));
const mockMfaAssurance = vi.hoisted(() => ({ needsMfaChallenge: vi.fn() }));
const mockSupabase = vi.hoisted(() => ({
  supabase: { rpc: vi.fn(), auth: { getSession: vi.fn(), signOut: vi.fn() } },
}));
const mockAppMetrics = vi.hoisted(() => ({
  markTimeToMainScreen: vi.fn(),
  recordAuthzFailure: vi.fn(),
}));

vi.mock('@/features/auth/hooks/useAuth', () => mockUseAuth);
vi.mock('@/features/auth/hooks/useRouteRoles', () => mockUseRouteRoles);
vi.mock('@/features/auth/hooks/mfaAssurance', () => mockMfaAssurance);
vi.mock('@/integrations/supabase/client', () => mockSupabase);
vi.mock('@/lib/appMetrics', () => mockAppMetrics);

function applyAuthState() {
  mockUseAuth.useAuth.mockReturnValue({
    user: { id: 'user-1' },
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
    bootstrapError: null,
    bootstrapElapsedMs: null,
    retryBootstrap: vi.fn(),
    roles: ['agent'],
    permissions: [] as string[],
    refreshPermissions: vi.fn(),
    refreshRoles: vi.fn(),
  });
}

function TwoFaProbe() {
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? 'none';
  return <div>{`TWOFA_FROM:${from}`}</div>;
}

function renderProtected(ui: ReactElement, initialPath = '/crm') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/crm" element={ui} />
        <Route path="/2fa" element={<TwoFaProbe />} />
        <Route path="/auth" element={<div>AUTH_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  applyAuthState();
  mockUseRouteRoles.useRouteRoles.mockReturnValue(null);
  mockSupabase.supabase.rpc.mockResolvedValue({ data: false, error: null });
});

describe('ProtectedRoute — gate de 2FA/AAL2 (E71)', () => {
  it('needsMfaChallenge=true redireciona para /2fa preservando o destino em state.from', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(true);

    renderProtected(
      <ProtectedRoute>
        <div>CRM_CHILDREN</div>
      </ProtectedRoute>
    );

    expect(await screen.findByText('TWOFA_FROM:/crm')).toBeInTheDocument();
    expect(screen.queryByText('CRM_CHILDREN')).not.toBeInTheDocument();
  });

  it('needsMfaChallenge=false renderiza a rota normalmente', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(false);

    renderProtected(
      <ProtectedRoute>
        <div>CRM_CHILDREN</div>
      </ProtectedRoute>
    );

    expect(await screen.findByText('CRM_CHILDREN')).toBeInTheDocument();
  });

  it('não renderiza os children antes de needsMfaChallenge resolver (evita flash de conteúdo protegido)', async () => {
    let resolveChallenge: (value: boolean) => void = () => {};
    mockMfaAssurance.needsMfaChallenge.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveChallenge = resolve;
      })
    );

    renderProtected(
      <ProtectedRoute>
        <div>CRM_CHILDREN</div>
      </ProtectedRoute>
    );

    // Enquanto a checagem de AAL está pendente, nem children nem /2fa aparecem —
    // só o spinner de "Verificando acesso".
    expect(screen.queryByText('CRM_CHILDREN')).not.toBeInTheDocument();
    expect(screen.queryByText(/TWOFA_FROM/)).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Verificando acesso' })).toBeInTheDocument();

    resolveChallenge(false);
    await waitFor(() => {
      expect(screen.getByText('CRM_CHILDREN')).toBeInTheDocument();
    });
  });

  it('desafio de 2FA tem precedência sobre negação de role (identidade insuficiente barra antes)', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(true);

    renderProtected(
      <ProtectedRoute requiredRoles={['admin']}>
        <div>CRM_CHILDREN</div>
      </ProtectedRoute>
    );

    expect(await screen.findByText('TWOFA_FROM:/crm')).toBeInTheDocument();
  });

  it('defesa em profundidade: se needsMfaChallenge() rejeitar (hoje nunca acontece em produção), falha FECHADA e redireciona para /2fa em vez de travar mfaChecked para sempre', async () => {
    mockMfaAssurance.needsMfaChallenge.mockRejectedValue(new Error('falha inesperada'));

    renderProtected(
      <ProtectedRoute>
        <div>CRM_CHILDREN</div>
      </ProtectedRoute>
    );

    expect(await screen.findByText('TWOFA_FROM:/crm')).toBeInTheDocument();
    expect(screen.queryByText('CRM_CHILDREN')).not.toBeInTheDocument();
  });
});
