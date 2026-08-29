/**
 * useForgotPassword — consumo do 422 canônico (Bloco 7, etapa 78).
 *
 * Contrato: o gate de contrato da EF pública `request-password-reset`
 * rejeita payload inválido com o envelope canônico
 * `{error:true, code:'VALIDATION_ERROR', message, details:[{path,message}]}`
 * (HTTP 422). Antes da migração pra `invokeEdge`, esse corpo era descartado
 * (`throw invokeError` + catch genérico) e o usuário via apenas
 * "Erro ao enviar solicitação" mesmo quando o servidor dizia exatamente
 * o que estava errado no campo `email`.
 *
 * Eixos:
 *   1. 422 VALIDATION_ERROR com details[{path:'email'}] → estado `error`
 *      exibe a mensagem do campo (renderizada sob o input com role="alert"
 *      em ForgotPassword.tsx) + toast.error com a MESMA mensagem; `sent`
 *      permanece false.
 *   2. Erro de domínio fora do envelope canônico ({message}) → mensagem
 *      honesta do servidor no `error`/toast (não silenciada).
 *   3. Sucesso → sent=true + toast.success (sem regressão).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { useForgotPassword } from '@/hooks/useForgotPassword';
import { toast } from 'sonner';

const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

/** Erro no shape supabase-js v2: { data: null, error: FunctionsHttpError } —
 * `context.json()` devolve o corpo da resposta HTTP. */
function httpError(body: unknown, status = 422) {
  return { context: { status, json: vi.fn().mockResolvedValue(body) } };
}

describe('useForgotPassword — 422 canônico (etapa 78)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('422 VALIDATION_ERROR em details[email] → erro do campo no estado + toast, sem sucesso', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Corpo rejeitado pelo contrato request-password-reset@v1',
        details: [{ path: 'email', message: 'Email inválido' }],
      }),
    });

    const { result } = renderHook(() => useForgotPassword());
    // Email sintaticamente válido (passa no zod client-side) que o servidor
    // ainda rejeita — exerce o caminho invokeEdge, não o gate local.
    act(() => {
      result.current.setEmail('usuario@mailinator.com');
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(invokeMock).toHaveBeenCalledWith('request-password-reset', {
      body: {
        email: 'usuario@mailinator.com',
        reason: undefined,
        userAgent: navigator.userAgent,
      },
    });
    expect(result.current.sent).toBe(false);
    expect(result.current.error).toBe('Email inválido');
    expect(mockToast.error).toHaveBeenCalledWith('Email inválido');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('erro de domínio fora do envelope canônico → mensagem honesta do servidor (não silenciada)', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError({ message: 'Muitas solicitações. Tente novamente em 1 hora.' }, 429),
    });

    const { result } = renderHook(() => useForgotPassword());
    act(() => {
      result.current.setEmail('usuario@exemplo.com');
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.sent).toBe(false);
    expect(result.current.error).toBe('Muitas solicitações. Tente novamente em 1 hora.');
    expect(mockToast.error).toHaveBeenCalledWith('Muitas solicitações. Tente novamente em 1 hora.');
  });

  it('sucesso → sent=true + toast.success (sem regressão)', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });

    const { result } = renderHook(() => useForgotPassword());
    act(() => {
      result.current.setEmail('usuario@exemplo.com');
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.sent).toBe(true);
    expect(result.current.error).toBe('');
    expect(mockToast.success).toHaveBeenCalledWith(
      'Solicitação enviada! Aguarde a aprovação de um administrador.'
    );
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});
