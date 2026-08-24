import { useState } from 'react';
import { z } from 'zod';
import { invokeEdge } from '@/lib/invokeEdge';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('ForgotPassword');
const emailSchema = z.string().email('Email inválido');

/**
 * Solicitação pública de reset (Etapa 55).
 *
 * Rota: EF pública `request-password-reset` (rate-limit + anti-enumeração +
 * lookup server-side). NUNCA inserir direto em password_reset_requests:
 * a RLS da tabela é authenticated-only (prr_insert_own exige
 * user_id = auth.uid()) e profiles não é legível por anon — o insert
 * client-side morria em produção.
 */
export function useForgotPassword() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      emailSchema.parse(email);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
        return;
      }
    }

    setLoading(true);
    // Bloco 7 (etapa 80, F1): antes `throw invokeError` caía num catch
    // genérico ("Erro ao enviar solicitação. Tente novamente.") mesmo
    // quando o 422 tinha um motivo específico (ex.: rate-limit, e-mail
    // malformado além da checagem local). invokeEdge preserva a mensagem
    // real do servidor sem lançar.
    const result = await invokeEdge('request-password-reset', {
      body: {
        email,
        reason: reason || undefined,
        userAgent: navigator.userAgent,
      },
    });

    if (!result.ok) {
      log.error('Error submitting reset request:', result.message || result.code);
      const message = result.message || 'Erro ao enviar solicitação. Tente novamente.';
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    setSent(true);
    toast.success('Solicitação enviada! Aguarde a aprovação de um administrador.');
    setLoading(false);
  };

  return { email, setEmail, reason, setReason, loading, sent, error, handleSubmit };
}
