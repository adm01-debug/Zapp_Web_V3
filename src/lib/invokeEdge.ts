/**
 * invokeEdge.ts — wrapper único para `supabase.functions.invoke`.
 *
 * PLANO-100-CONTRATOS-EDGE, Bloco 7 (etapa 75): o backend emite o envelope
 * 422 canônico (`{error:true, code, message, details:[{path,message}]}` —
 * `contract-kit.ts` no backend, `isContractErrorResponse` no front), mas
 * nenhum dos 153 call-sites de `functions.invoke` no app lia `details[]` —
 * cada um tratava erro sozinho, quase sempre descartando o corpo da resposta
 * (`String(FunctionsHttpError)` ou uma mensagem genérica hardcoded).
 *
 * `invokeEdge` centraliza a extração: lê `error.context` (supabase-js v2
 * — FunctionsHttpError carrega a Response ali), tenta parsear o JSON e,
 * se bater o shape canônico, devolve `code`/`message` reais do servidor +
 * `fieldErrors` (Record<path, message> — mesmo shape que `useAuthForm.ts`
 * já usa para erros de validação client-side, então os dois caminhos
 * alimentam o mesmo `setErrors`/estado de formulário sem tradução).
 *
 * Fora do shape canônico (rede, 500, 404 de rota) cai no fallback genérico —
 * ver docs/CONTRACT_TESTING.md "Erros NÃO de validação" para o porquê de não
 * tentar encaixar esses casos no envelope de contrato.
 */
import { supabase } from '@/integrations/supabase/client';
import { isContractErrorResponse, type ContractErrorResponse } from '@/shared/webhookEventSchemas';

type InvokeOptions = Parameters<typeof supabase.functions.invoke>[1];

export interface InvokeEdgeSuccess<T> {
  ok: true;
  data: T;
}

export interface InvokeEdgeFailure {
  ok: false;
  /** Code real do backend (`contract_violation`, `invalid_json`, ...) quando o
   *  envelope canônico foi identificado; `'network_error'`/`'unknown'` caso
   *  contrário — ver `docs/CONTRACT_TESTING.md`. */
  code: string;
  /** Mensagem honesta do servidor quando disponível; fallback genérico caso
   *  contrário (nunca vazia). */
  message: string;
  /** `{path: message}` extraído de `details[]` — primeiro erro por campo
   *  vence. Vazio quando a falha não é uma violação de contrato por campo
   *  (erro de rede/infra, ou envelope de domínio não-canônico). */
  fieldErrors: Record<string, string>;
  /** Envelope canônico bruto, quando identificado — para chamadores que
   *  precisam de `contract`/`requestId`/`details[]` verbatim. */
  raw?: ContractErrorResponse;
}

export type InvokeEdgeResult<T> = InvokeEdgeSuccess<T> | InvokeEdgeFailure;

/**
 * Lê o corpo JSON de um erro de `functions.invoke` (supabase-js v2:
 * `FunctionsHttpError.context` carrega a `Response`). Retorna `null` quando
 * não há corpo parseável (erro de rede, `FunctionsFetchError`, etc.).
 */
async function readInvokeErrorBody(error: unknown): Promise<unknown> {
  if (typeof error !== 'object' || error === null || !('context' in error)) return null;
  const ctx = (error as { context?: unknown }).context as
    { json?: () => Promise<unknown> } | undefined;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    return await ctx.json();
  } catch {
    return null;
  }
}

/**
 * Fallback pra corpos de erro que não batem o envelope canônico mas ainda
 * carregam texto legível — os 319 call-sites `{error: "string"}` (F1 do
 * relatório de auditoria) e o `{message: "..."}` de domínio pré-Bloco 2 que
 * ainda não migraram pra `errorEnvelope()`. Sem isso, migrar um call-site
 * pra `invokeEdge` regride a mensagem real pro fallback genérico.
 */
function extractReadableMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message === 'string' && b.message.length > 0) return b.message;
  if (typeof b.error === 'string' && b.error.length > 0) return b.error;
  return null;
}

/**
 * Invoca uma edge function e normaliza o resultado. Nunca lança — erros de
 * rede, HTTP e de contrato chegam todos como `{ok: false, ...}`.
 */
export async function invokeEdge<T = unknown>(
  functionName: string,
  options?: InvokeOptions
): Promise<InvokeEdgeResult<T>> {
  let invocation: Awaited<ReturnType<typeof supabase.functions.invoke<T>>>;
  try {
    invocation = await supabase.functions.invoke<T>(functionName, options);
  } catch {
    // O SDK normalmente devolve FunctionsFetchError em `error`, mas adapters,
    // mocks e falhas inesperadas também podem rejeitar a Promise. Preserve o
    // contrato público deste wrapper: chamadores nunca precisam de try/finally
    // apenas para não deixar estado de loading preso.
    return { ok: false, code: 'network_error', message: '', fieldErrors: {} };
  }

  const { data, error } = invocation;

  if (!error) {
    return { ok: true, data: data as T };
  }

  const body = await readInvokeErrorBody(error);
  if (isContractErrorResponse(body)) {
    const fieldErrors: Record<string, string> = {};
    for (const detail of body.details ?? []) {
      if (!(detail.path in fieldErrors)) fieldErrors[detail.path] = detail.message;
    }
    return { ok: false, code: body.code, message: body.message, fieldErrors, raw: body };
  }

  const domainMessage = extractReadableMessage(body);
  if (domainMessage) {
    return { ok: false, code: 'domain_error', message: domainMessage, fieldErrors: {} };
  }

  // Sem corpo parseável: falha de rede/infra (FunctionsFetchError, timeout).
  // `error.message` aqui é texto técnico do fetch (ex.: "Failed to fetch"),
  // não uma mensagem pra usuário final — `message` fica vazio de propósito
  // (não `undefined`) para que o padrão já usado em todo o app,
  // `result.message || 'mensagem genérica do fluxo'`, continue funcionando
  // sem cada chamador precisar checar `result.code === 'network_error'`.
  return { ok: false, code: 'network_error', message: '', fieldErrors: {} };
}
