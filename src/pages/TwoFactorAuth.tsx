import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from '@/components/ui/motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useMFA } from '@/features/auth';
import { MFAVerify } from '@/features/auth';
import { needsMfaChallenge } from '@/features/auth/hooks/mfaAssurance';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

/** Caminho relativo same-origin seguro para redirect pós-2FA (mesmo critério de useAuthForm). */
function isSafeRelativePath(path: string | null | undefined): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

/** Two Factor Auth. */
export default function TwoFactorAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { fetchFactors } = useMFA();
  const [needsVerification, setNeedsVerification] = useState(false);

  // E71: preserva o destino original (ProtectedRoute/redirectAfterAuth chegam
  // aqui com state.from) — sem isso, completar o 2FA sempre jogava o usuário
  // para "/" mesmo quando a intenção era, por exemplo, voltar para /crm.
  const stateFrom = (
    location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null
  )?.from;
  const rawDestPath = stateFrom?.pathname
    ? `${stateFrom.pathname}${stateFrom.search ?? ''}${stateFrom.hash ?? ''}`
    : null;
  const destination = isSafeRelativePath(rawDestPath) ? rawDestPath : '/';

  useEffect(() => {
    // Aguarda o bootstrap de sessão antes de decidir (evita bounce falso para /auth).
    if (loading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    let cancelled = false;
    const checkMFAStatus = async () => {
      // fetchFactors() popula o estado 'factors' consumido pelo <MFAVerify> abaixo.
      await fetchFactors();
      if (cancelled) return;

      // needsMfaChallenge() é a MESMA checagem fail-closed condicional usada por
      // ProtectedRoute e useAuthForm (mfaAssurance.ts) — antes desta correção,
      // esta tela tinha sua própria checagem via useMFA().getAssuranceLevel(),
      // que era fail-OPEN em qualquer erro (rede/GoTrue). Isso permitia que uma
      // instabilidade sustentada anulasse o gate: o ProtectedRoute barrava
      // corretamente (fail-closed) e redirecionava pra cá, mas esta tela então
      // liberava o usuário sem pedir o código, sob a mesma instabilidade.
      const required = await needsMfaChallenge();
      if (cancelled) return;

      if (required) {
        setNeedsVerification(true);
      } else {
        // Já verificado (aal2) OU sem fator TOTP configurado: nada a verificar
        // — segue para o destino original em vez de girar para sempre.
        navigate(destination, { replace: true });
      }
    };

    void checkMFAStatus();
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate, fetchFactors, destination]);

  if (!needsVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 animate-pulse text-muted-foreground" />
          <p className="text-muted-foreground">Verificando status de autenticação...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <MFAVerify
          title="Verificação Necessária"
          description="Para continuar, verifique sua identidade com 2FA"
          onSuccess={() => navigate(destination, { replace: true })}
          onCancel={() => {
            // Sign out and go back to login
            supabase.auth
              .signOut()
              .then(() => navigate('/auth'))
              .catch((err) => log.warn('[2FA] signOut failed:', err));
          }}
        />

        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para login
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
