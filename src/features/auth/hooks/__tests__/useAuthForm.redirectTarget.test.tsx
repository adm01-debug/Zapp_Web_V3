import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthForm } from '../useAuthForm';

const mfa = vi.hoisted(() => ({
  getAAL: vi.fn(),
  listFactors: vi.fn(),
}));

const navigateMock = vi.fn();

vi.mock('@/integrations/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/supabase/client')>();
  return {
    ...actual,
    supabase: {
      ...actual.supabase,
      auth: {
        ...(actual.supabase as unknown as typeof actual.supabase).auth,
        mfa: {
          getAuthenticatorAssuranceLevel: mfa.getAAL,
          listFactors: mfa.listFactors,
        },
      },
    },
  } as unknown as typeof actual;
});

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'dev@x.com' },
    signIn: vi.fn(),
    signUp: vi.fn(),
  }),
}));

vi.mock('@/hooks/useWebAuthn', () => ({
  useWebAuthn: () => ({
    isSupported: () => false,
    isPlatformAuthenticatorAvailable: async () => false,
    authenticateWithPasskey: vi.fn(),
    loading: false,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const verifiedNoStepUp = {
  data: { currentLevel: 'aal2', nextLevel: 'aal2' },
  error: null,
};

describe('useAuthForm — restore do destino pós-auth', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    mfa.getAAL.mockReset();
    mfa.listFactors.mockReset();
    mfa.getAAL.mockResolvedValue(verifiedNoStepUp);
    mfa.listFactors.mockResolvedValue({ data: { totp: [], webauthn: [] }, error: null });
  });

  it('usa ?next quando presente e seguro', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/auth?next=%2Fcrm']}>{children}</MemoryRouter>
    );

    renderHook(() => useAuthForm(), { wrapper });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/crm', { replace: true });
    });
  });

  it('cai para location.state.from quando next não existe', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/auth',
            state: { from: { pathname: '/crm', search: '?tab=360', hash: '#history' } },
          },
        ]}
      >
        {children}
      </MemoryRouter>
    );

    renderHook(() => useAuthForm(), { wrapper });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/crm?tab=360#history', { replace: true });
    });
  });

  it('ignora destinos inseguros e volta para /', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/auth',
            search: '?next=%2F%2Fevil.test',
            state: { from: { pathname: '//evil.test' } },
          },
        ]}
      >
        {children}
      </MemoryRouter>
    );

    renderHook(() => useAuthForm(), { wrapper });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
  });
});
