import { dbFrom } from '@/integrations/datasource/db';
import { withSupabaseHighPrioritySignal } from '@/integrations/supabase/client';

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
