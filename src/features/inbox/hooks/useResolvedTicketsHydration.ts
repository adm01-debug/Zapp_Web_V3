import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ticketStore } from '@/lib/inbox/ticketStore';

const RESOLVED_CONTACT_IDS_QUERY_KEY = ['inbox', 'resolved-contact-ids'] as const;

/**
 * Hidrata o overlay de tickets (`ticketStore`) com os contatos duravelmente
 * encerrados (`conversation_closures.contact_id`) no boot da inbox.
 *
 * Por quê: o status `resolved` vivia só em `localStorage` (por máquina), então a
 * aba "Resolvidos" ficava vazia em qualquer sessão/dispositivo que não fosse o
 * que encerrou a conversa. A escrita durável já existe (`CloseConversationDialog`
 * grava `conversation_closures`); aqui só lemos essa fonte canônica e hidratamos
 * o overlay para a UI refletir o estado real em qualquer lugar.
 */
export function useResolvedTicketsHydration() {
  const { data } = useQuery({
    queryKey: RESOLVED_CONTACT_IDS_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('conversation_closures')
        .select('contact_id');
      if (error) throw error;
      return Array.from(new Set((rows ?? []).map((r) => r.contact_id).filter(Boolean)));
    },
  });

  useEffect(() => {
    if (data && data.length > 0) {
      ticketStore.hydrateResolved(data);
    }
  }, [data]);
}
