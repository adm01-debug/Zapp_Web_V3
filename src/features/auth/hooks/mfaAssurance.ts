import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('mfaAssurance');

/**
 * E52/E71 — decide se a sessão atual precisa completar o desafio de 2FA
 * (aal1→aal2) antes de prosseguir.
 *
 * Fail-closed condicional: só exige o desafio quando o usuário TEM um fator
 * TOTP verified — nunca bloqueia quem não configurou MFA, mesmo que a própria
 * checagem de assurance level falhe (rede/GoTrue indisponível). Extraído de
 * useAuthForm.redirectAfterAuth para ser reaproveitado também pelo
 * ProtectedRoute, que até então nunca verificava AAL2 — uma sessão persistida
 * em aal1 que navegasse direto para uma rota protegida (sem passar por /auth)
 * nunca era barrada pelo desafio de 2FA.
 */
export async function needsMfaChallenge(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!error) {
      return data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2';
    }
    log.warn('[mfaAssurance] getAuthenticatorAssuranceLevel falhou — checando fatores', { error });
  } catch (err) {
    log.warn('[mfaAssurance] getAuthenticatorAssuranceLevel lançou exceção — checando fatores', {
      err,
    });
  }
  try {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    return (factors?.totp ?? []).some((f) => f.status === 'verified');
  } catch {
    return false;
  }
}
