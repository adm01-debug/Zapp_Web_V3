import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TwoFactorAuth from '../TwoFactorAuth';

/**
 * TwoFactorAuth — antes desta correção, esta tela tinha sua PRÓPRIA checagem
 * de assurance level (via useMFA().getAssuranceLevel()), fail-OPEN em
 * qualquer erro — divergente da checagem fail-closed condicional
 * (needsMfaChallenge, mfaAssurance.ts) usada por ProtectedRoute. Isso permitia
 * que uma instabilidade de rede sustentada anulasse o gate por completo: o
 * ProtectedRoute barrava corretamente (fail-closed) e redirecionava pra cá,
 * mas esta tela liberava o usuário sem pedir o código sob a mesma
 * instabilidade (achado da auditoria adversarial de segurança, 2026-09-05).
 * O fix faz esta tela reaproveitar needsMfaChallenge() — a mesma fonte de
 * verdade do ProtectedRoute — eliminando a lógica divergente.
 */

const mockUseAuth = vi.hoisted(() => ({ useAuth: vi.fn() }));
const mockMfaAssurance = vi.hoisted(() => ({ needsMfaChallenge: vi.fn() }));
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/features/auth', () => ({
  useAuth: mockUseAuth.useAuth,
  MFAVerify: ({ onSuccess }: { onSuccess: () => void }) => (
    <div>
      MFA_VERIFY_SCREEN
      <button onClick={onSuccess}>completar-2fa</button>
    </div>
  ),
}));

vi.mock('@/features/auth/hooks/mfaAssurance', () => mockMfaAssurance);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}));

vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn() } }));

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => {
      const domProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => !['initial', 'animate', 'exit'].includes(key))
      );
      return <div {...domProps}>{children}</div>;
    },
  },
}));

function applyDefaults() {
  mockUseAuth.useAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false });
}

function renderWithState(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/2fa', state }]}>
      <Routes>
        <Route path="/2fa" element={<TwoFactorAuth />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  applyDefaults();
});

describe('TwoFactorAuth — usa needsMfaChallenge (fail-closed condicional) em vez de checagem própria', () => {
  it('needsMfaChallenge=true renderiza o desafio de 2FA (MFAVerify), não libera o usuário', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(true);

    renderWithState();

    expect(await screen.findByText('MFA_VERIFY_SCREEN')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
  });

  it('needsMfaChallenge=false navega direto para o destino (nada a verificar)', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(false);

    renderWithState();

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
    expect(screen.queryByText('MFA_VERIFY_SCREEN')).not.toBeInTheDocument();
  });

  it('regressão: mesmo com needsMfaChallenge=true (fator verified sob falha de rede), NÃO existe mais um caminho fail-open próprio desta tela — o desafio é sempre exigido', async () => {
    // Cenário do bug original: getAuthenticatorAssuranceLevel() falha (rede),
    // mas o usuário TEM fator TOTP verified — needsMfaChallenge() retorna
    // true por design fail-closed condicional (mfaAssurance.ts). Antes do
    // fix, esta tela ignorava esse resultado e usava sua própria checagem
    // (useMFA().getAssuranceLevel(), fail-open em erro) — liberando o
    // usuário sem pedir o código. Agora não há mais essa checagem paralela.
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(true);

    renderWithState({ from: { pathname: '/crm' } });

    expect(await screen.findByText('MFA_VERIFY_SCREEN')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith('/crm', { replace: true });
  });

  it('preserva o destino original (state.from) ao completar o desafio com sucesso', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(true);

    renderWithState({ from: { pathname: '/crm', search: '?tab=x' } });

    const button = await screen.findByText('completar-2fa');
    button.click();

    expect(navigateMock).toHaveBeenCalledWith('/crm?tab=x', { replace: true });
  });

  it('sem user, redireciona para /auth sem chamar needsMfaChallenge', async () => {
    mockUseAuth.useAuth.mockReturnValue({ user: null, loading: false });

    renderWithState();

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/auth', { replace: true });
    });
    expect(mockMfaAssurance.needsMfaChallenge).not.toHaveBeenCalled();
  });

  it('state.from com path não-relativo (absoluto/externo) cai no fallback seguro "/"', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(false);

    renderWithState({ from: { pathname: '//evil.com' } });

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('defesa em profundidade: se needsMfaChallenge() rejeitar (hoje nunca acontece em produção), falha FECHADA e exige o desafio em vez de travar ou liberar', async () => {
    mockMfaAssurance.needsMfaChallenge.mockRejectedValue(new Error('falha inesperada'));

    renderWithState();

    expect(await screen.findByText('MFA_VERIFY_SCREEN')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
  });
});
