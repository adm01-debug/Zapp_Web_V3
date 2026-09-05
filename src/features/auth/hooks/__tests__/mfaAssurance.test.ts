import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * E52/E71 — needsMfaChallenge(), extraída de useAuthForm.redirectAfterAuth
 * para ser reaproveitada pelo ProtectedRoute (achado da auditoria do plano
 * canônico, 2026-09-02: ProtectedRoute nunca verificava AAL2, permitindo que
 * uma sessão persistida em aal1 acessasse rotas protegidas sem completar 2FA).
 *
 * Mesmos 5 ramos já cobertos indiretamente em useAuthForm.e52.test.tsx,
 * testados aqui diretamente contra a função pura.
 */

const mfa = vi.hoisted(() => ({
  getAAL: vi.fn(),
  listFactors: vi.fn(),
}));

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

import { needsMfaChallenge } from '../mfaAssurance';

const verifiedTotp = [{ id: 't1', status: 'verified', type: 'totp' }];
const noFactors: { id: string; status: string; type: string }[] = [];

describe('needsMfaChallenge', () => {
  beforeEach(() => {
    mfa.getAAL.mockReset();
    mfa.listFactors.mockReset();
  });

  it('R1: aal1→aal2 sem erro → true (exige desafio)', async () => {
    mfa.getAAL.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    await expect(needsMfaChallenge()).resolves.toBe(true);
  });

  it('aal2→aal2 (já verificado) → false', async () => {
    mfa.getAAL.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });
    await expect(needsMfaChallenge()).resolves.toBe(false);
  });

  it('aal1→aal1 (sem MFA configurado) → false', async () => {
    mfa.getAAL.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    });
    await expect(needsMfaChallenge()).resolves.toBe(false);
  });

  it('R2: getAAL erro + fator verified → true (fail-closed)', async () => {
    mfa.getAAL.mockResolvedValue({ data: null, error: { message: 'boom' } });
    mfa.listFactors.mockResolvedValue({ data: { totp: verifiedTotp, webauthn: [] }, error: null });
    await expect(needsMfaChallenge()).resolves.toBe(true);
  });

  it('R3: getAAL erro + sem fator verified → false (evita lockout)', async () => {
    mfa.getAAL.mockResolvedValue({ data: null, error: { message: 'boom' } });
    mfa.listFactors.mockResolvedValue({ data: { totp: noFactors, webauthn: [] }, error: null });
    await expect(needsMfaChallenge()).resolves.toBe(false);
  });

  it('R4: exceção em getAAL + fator verified → true', async () => {
    mfa.getAAL.mockRejectedValue(new Error('network'));
    mfa.listFactors.mockResolvedValue({ data: { totp: verifiedTotp, webauthn: [] }, error: null });
    await expect(needsMfaChallenge()).resolves.toBe(true);
  });

  it('R5: exceção em getAAL + sem fator → false', async () => {
    mfa.getAAL.mockRejectedValue(new Error('network'));
    mfa.listFactors.mockResolvedValue({ data: { totp: noFactors, webauthn: [] }, error: null });
    await expect(needsMfaChallenge()).resolves.toBe(false);
  });

  it('exceção em getAAL + exceção em listFactors → false (nunca trava o usuário)', async () => {
    mfa.getAAL.mockRejectedValue(new Error('network'));
    mfa.listFactors.mockRejectedValue(new Error('network'));
    await expect(needsMfaChallenge()).resolves.toBe(false);
  });
});
