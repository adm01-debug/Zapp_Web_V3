import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SSOCallback from '../SSOCallback';

/**
 * SSOCallback — redirectAfterAuth() reimplementava sua própria checagem de
 * aal1->aal2 (fail-open em erro), divergente de needsMfaChallenge()
 * (mfaAssurance.ts), a mesma fonte de verdade usada por ProtectedRoute,
 * useAuthForm e TwoFactorAuth. O gate '/' já é reguardado por ProtectedRoute
 * (não era um bypass explorável), mas era a última implementação duplicada
 * do mesmo padrão — consolidada aqui (auditoria round 2, 2026-09-05).
 */

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const mockMfaAssurance = vi.hoisted(() => ({ needsMfaChallenge: vi.fn() }));
vi.mock('@/features/auth/hooks/mfaAssurance', () => mockMfaAssurance);

const onAuthStateChangeMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: onAuthStateChangeMock,
      getSession: getSessionMock,
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) => {
      const domProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => !['initial', 'animate', 'transition'].includes(key))
      );
      return <div {...domProps}>{children as never}</div>;
    },
  },
}));

let authChangeCallback: ((event: string, session: unknown) => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  authChangeCallback = null;
  onAuthStateChangeMock.mockImplementation((cb: (event: string, session: unknown) => void) => {
    authChangeCallback = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

async function triggerSignedInAndAdvance() {
  await act(async () => {
    authChangeCallback?.('SIGNED_IN', { user: { id: 'u1' } });
    await vi.advanceTimersByTimeAsync(1500);
  });
}

describe('SSOCallback — usa needsMfaChallenge (fail-closed condicional) em vez de checagem própria', () => {
  it('needsMfaChallenge=true redireciona para /2fa após login SSO', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(true);

    await act(async () => {
      render(
        <MemoryRouter>
          <SSOCallback />
        </MemoryRouter>
      );
    });

    await triggerSignedInAndAdvance();

    expect(mockMfaAssurance.needsMfaChallenge).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/2fa', { replace: true });
  });

  it('needsMfaChallenge=false navega direto para "/" (nada a verificar)', async () => {
    mockMfaAssurance.needsMfaChallenge.mockResolvedValue(false);

    await act(async () => {
      render(
        <MemoryRouter>
          <SSOCallback />
        </MemoryRouter>
      );
    });

    await triggerSignedInAndAdvance();

    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });
});
