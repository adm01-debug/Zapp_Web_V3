/**
 * gmailApi — preservação do erro real do servidor (PLANO-100-CONTRATOS-EDGE,
 * Bloco 7, etapa 79 / F6).
 *
 * Antes: TODA falha de `functions.invoke` (16 call-sites), incluindo um 422
 * de validação com mensagem/campo específicos, virava
 * `{code:500, message: error.message, status:'INTERNAL'}` — `error.message`
 * do supabase-js é só "Edge Function returned a non-2xx status code", então
 * o motivo real (`message`/`details[]` do servidor) era descartado. Este
 * teste cobre a migração pra `invokeEdge`, que preserva `code`/`message`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
}));

import { createEmailLabel, emailMarkRead, emailSendMessage } from '@/hooks/gmail/gmailApi';
import { supabase } from '@/integrations/supabase/client';

const mockInvoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

function httpError(body: unknown) {
  return { context: { json: vi.fn().mockResolvedValue(body) } };
}

describe('gmailApi — preserva code/message reais em vez de sempre 500 INTERNAL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createEmailLabel: sucesso repassa data', async () => {
    mockInvoke.mockResolvedValue({ data: { labelId: 'lbl-1', name: 'Urgente' }, error: null });

    const result = await createEmailLabel('acc-1', 'Urgente');

    expect(result).toEqual({ data: { labelId: 'lbl-1', name: 'Urgente' }, error: null });
  });

  it('createEmailLabel: 422 de contrato preserva message real + fieldErrors (não vira 500 INTERNAL)', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({
        error: true,
        code: 'contract_violation',
        message: 'name é obrigatório',
        details: [{ path: 'name', message: 'name é obrigatório' }],
      }),
    });

    const result = await createEmailLabel('acc-1', '');

    expect(result.data).toBeNull();
    expect(result.error).toEqual({
      code: 422,
      message: 'name é obrigatório',
      status: 'CONTRACT_VIOLATION',
      fieldErrors: { name: 'name é obrigatório' },
    });
  });

  it('emailMarkRead (formatação sem linha em branco): 403 de domínio preserva a mensagem real', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({ error: 'Forbidden: account not owned by caller' }),
    });

    const result = await emailMarkRead({ accountId: 'acc-2', messageIds: ['m1'], read: true });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Forbidden: account not owned by caller');
    expect(result.error?.code).toBe(500);
    expect(result.error?.fieldErrors).toBeUndefined();
  });

  it('emailSendMessage: falha de rede não vaza texto técnico do fetch, cai no fallback genérico', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });

    const result = await emailSendMessage({
      accountId: 'acc-3',
      to: ['dest@example.com'],
      subject: 'Oi',
      bodyHtml: '<p>Oi</p>',
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Erro ao processar a solicitação.');
    expect(result.error?.status).toBe('NETWORK_ERROR');
  });
});
