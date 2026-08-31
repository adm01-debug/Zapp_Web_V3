import { dbFrom } from '@/integrations/datasource/db';
import { withSupabaseHighPrioritySignal } from '@/integrations/supabase/client';

interface MarkReadErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

/**
 * Somente falhas comprovadamente transitórias devem recolocar o batch na fila.
 * Erros 4xx, de contrato/schema e de autorização exigem correção humana; fazer
 * backoff deles apenas repete uma operação que nunca poderá ter sucesso.
 */
export function isTransientMarkReadError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as MarkReadErrorLike;
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  if (name === 'SupabaseQueueSaturatedError' || name === 'SupabaseQueueTimeoutError') return true;

  const rawStatus = candidate.status ?? candidate.statusCode;
  const status =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string' && /^\d{3}$/.test(rawStatus)
        ? Number(rawStatus)
        : null;
  if (status === 429 || (status !== null && status >= 500)) return true;
  if (status !== null && status >= 400 && status < 500) return false;

  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('queue saturated') ||
    message.includes('queue wait timed out')
  );
}

/** Persiste o batch de leitura com prioridade sem promover queries auxiliares. */
export async function persistMessagesRead(contactIds: string[]): Promise<{ error: unknown }> {
  const controller = new AbortController();
  return withSupabaseHighPrioritySignal(controller.signal, async () => {
    const request = dbFrom('messages')
      .update({ is_read: true })
      .in('contact_id', contactIds)
      .eq('sender', 'contact')
      .eq('is_read', false);
    // Builders reais do PostgREST expoem abortSignal; alguns adapters/mocks
    // resolvem a chain diretamente como Promise. O fallback mantem o contrato
    // testavel sem alterar a semantica de producao.
    const signalAware = request as typeof request & {
      abortSignal?: (signal: AbortSignal) => Promise<{ error: unknown }>;
    };
    const { error } = await (signalAware.abortSignal?.(controller.signal) ?? request);
    return { error };
  });
}
