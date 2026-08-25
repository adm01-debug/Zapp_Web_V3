/**
 * P16 (E66) — useMentionableProfiles
 * Substitui o cache module-level de MentionAutocomplete.tsx por React Query.
 * staleTime=5min equivale ao MENTION_TTL_MS anterior; placeholderData=[]
 * garante que o caller não precisa lidar com undefined.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentMention {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
}

const FIVE_MINUTES = 5 * 60_000;

export function useMentionableProfiles() {
  return useQuery<AgentMention[]>({
    queryKey: ['mention-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url')
        .limit(50);
      // B3 FIX: propagar erro para React Query marcar como errored e fazer retry
      if (error) throw new Error(error.message);
      return (data ?? []) as AgentMention[];
    },
    staleTime: FIVE_MINUTES,
    placeholderData: [],
    retry: 2,
  });
}
