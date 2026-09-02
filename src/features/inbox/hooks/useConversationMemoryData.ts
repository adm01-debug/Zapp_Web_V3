import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/schema';
import { isValidUUID } from '@/utils/uuid';

export async function fetchConversationMemory(contactId: string, signal?: AbortSignal) {
  if (!isValidUUID(contactId)) return null;
  const query = supabase.from('conversation_memory').select('*').eq('contact_id', contactId);
  if (signal) query.abortSignal(signal);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

export async function saveConversationMemory(
  existingId: string | undefined,
  payload: {
    contact_id: string;
    facts: Json;
    objections_handled: Json;
    promises_made: Json;
    pending_items: Json;
    commercial_summary: string | null;
    cumulative_summary: string | null;
    updated_by: string | null;
  }
) {
  if (!isValidUUID(payload.contact_id)) return { data: null, error: new Error('Invalid UUID') };
  if (existingId) {
    return supabase.from('conversation_memory').update(payload).eq('id', existingId);
  }
  return supabase.from('conversation_memory').insert(payload);
}
