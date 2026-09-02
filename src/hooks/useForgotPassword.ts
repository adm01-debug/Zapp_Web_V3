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
 *
 * Bloco 7 (etapa 78): migração para `invokeEdge` — o 422 canônico do gate
 * de contrato (VALIDATION_ERROR + details[]) agora chega ao usuário: o erro
 * do campo `email` vai para o estado exibido sob o input (ForgotPassword
 * renderiza `error` com role="alert"), demais mensagens caem no toast.
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
    const result = await invokeEdge('request-password-reset', {
      body: {
        email,
        reason: reason || undefined,
        userAgent: navigator.userAgent,
      },
    });

    if (!result.ok) {
      log.error('Error submitting reset request:', { code: result.code, message: result.message });
      // 422 canônico: prioriza o erro do campo `email` (o único editável do
      // formulário); senão mensagem honesta do servidor; senão fallback do fluxo.
      const firstField = Object.values(result.fieldErrors)[0];
      const message =
        result.fieldErrors.email ||
        firstField ||
        result.message ||
        'Erro ao enviar solicitação. Tente novamente.';
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
