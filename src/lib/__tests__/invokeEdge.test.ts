/**
 * invokeEdge — wrapper único de `functions.invoke` (PLANO-100-CONTRATOS-EDGE,
 * Bloco 7, etapa 85). Cobre os 4 shapes de corpo de erro que o wrapper
 * precisa distinguir sem regredir mensagem alguma:
 *   1. Sucesso.
 *   2. Envelope canônico 422 (`{error:true, code, message, details[]}`) →
 *      `fieldErrors` populado a partir de `details[]`.
 *   3. Erro de domínio legado (`{error: "string"}` ou `{message: "string"}`,
 *      F1 do relatório — 319 call-sites nesse shape) → mensagem real
 *      preservada, sem fieldErrors.
 *   4. Falha sem corpo parseável (rede/infra) → fallback genérico.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { invokeEdge } from '@/lib/invokeEdge';
import { supabase } from '@/integrations/supabase/client';

const mockInvoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

function httpError(body: unknown) {
  return { context: { json: vi.fn().mockResolvedValue(body) } };
}

describe('invokeEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sucesso: repassa data e ok=true', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const result = await invokeEdge<{ success: boolean }>('foo', { body: { a: 1 } });

    expect(mockInvoke).toHaveBeenCalledWith('foo', { body: { a: 1 } });
    expect(result).toEqual({ ok: true, data: { success: true } });
  });

  it('envelope canônico 422: extrai code/message reais + fieldErrors de details[]', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({
        error: true,
        code: 'contract_violation',
        message: 'Payload não satisfaz o contrato talkx-send@v1.',
        contract: 'talkx-send@v1',
        details: [
          { path: 'campaignId', message: 'campaignId deve ser UUID' },
          { path: 'to', message: 'to é obrigatório' },
        ],
      }),
    });

    const result = await invokeEdge('talkx-send');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('contract_violation');
    expect(result.message).toBe('Payload não satisfaz o contrato talkx-send@v1.');
    expect(result.fieldErrors).toEqual({
      campaignId: 'campaignId deve ser UUID',
      to: 'to é obrigatório',
    });
    expect(result.raw?.contract).toBe('talkx-send@v1');
  });

  it('details[] com paths repetidos: primeiro erro por campo vence', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({
        error: true,
        code: 'contract_violation',
        message: 'inválido',
        details: [
          { path: 'email', message: 'primeiro erro' },
          { path: 'email', message: 'segundo erro' },
        ],
      }),
    });

    const result = await invokeEdge('foo');

    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors).toEqual({ email: 'primeiro erro' });
  });

  it('erro de domínio legado {error:"string"} (409 duplicado): mensagem real preservada, sem fieldErrors', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({ error: 'Email already registered' }),
    });

    const result = await invokeEdge('invite-user');

    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('domain_error');
    expect(result.message).toBe('Email already registered');
    expect(result.fieldErrors).toEqual({});
  });

  it('erro de domínio legado {message:"string"}: message tem prioridade sobre error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({ error: true, message: 'Forbidden: admin required' }),
    });

    const result = await invokeEdge('foo');

    if (result.ok) throw new Error('unreachable');
    expect(result.message).toBe('Forbidden: admin required');
  });

  it('falha sem corpo parseável (rede/infra): message vazio (não o texto técnico do fetch), sem lançar', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: new Error('Failed to fetch'),
    });

    const result = await invokeEdge('foo');

    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('network_error');
    // message vazio de propósito — permite `result.message || 'fallback do fluxo'`
    // nos chamadores sem expor "Failed to fetch" ao usuário.
    expect(result.message).toBe('');
    expect(result.fieldErrors).toEqual({});
  });

  it('rejeição inesperada do SDK: preserva o contrato never-throw', async () => {
    mockInvoke.mockRejectedValue(new TypeError('fetch adapter rejected'));

    await expect(invokeEdge('foo')).resolves.toEqual({
      ok: false,
      code: 'network_error',
      message: '',
      fieldErrors: {},
    });
  });

  it('security envelope (details como objeto, não array) NÃO é tratado como contrato', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({
        error: true,
        code: 'MALWARE_DETECTED',
        message: 'Arquivo bloqueado pelo scanner.',
        details: { verdict: 'malicious', threat: 'trojan' },
      }),
    });

    const result = await invokeEdge('secure-upload');

    if (result.ok) throw new Error('unreachable');
    // isContractErrorResponse rejeita details não-array → cai no fallback de
    // mensagem legível, não no caminho canônico com fieldErrors do array.
    expect(result.code).toBe('domain_error');
    expect(result.message).toBe('Arquivo bloqueado pelo scanner.');
    expect(result.fieldErrors).toEqual({});
  });
});
