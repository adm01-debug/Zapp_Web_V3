import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from '@/components/ui/motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useMFA } from '@/features/auth';
import { MFAVerify } from '@/features/auth';
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
  const { getAssuranceLevel, fetchFactors } = useMFA();
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
      await fetchFactors();
      if (cancelled) return;
      const assurance = await getAssuranceLevel();
      if (cancelled) return;

      if (assurance) {
        // If user has MFA setup but hasn't verified this session
        if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
          setNeedsVerification(true);
        } else {
          // Already verified (aal2) OR no MFA configured (aal1→aal1):
          // nothing to verify — segue para o destino original em vez de girar para sempre.
          navigate(destination, { replace: true });
        }
      } else {
        // Falha ao obter assurance level — não bloquear o usuário.
        navigate(destination, { replace: true });
      }
    };

    void checkMFAStatus();
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate, getAssuranceLevel, fetchFactors, destination]);

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
