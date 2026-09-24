import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dbFrom } from '@/integrations/datasource/db';
import { getLogger } from '@/lib/logger';

const log = getLogger('useQueueDetails');

export interface QueueDetailsData {
  id: string;
  name: string;
  description: string | null;
  color: string;
  max_wait_time_minutes: number;
  created_at: string;
}

export interface QueueMember {
  id: string;
  profile_id: string;
  profile: { name: string; avatar_url: string | null; is_active: boolean };
}

export interface QueueContact {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
  assigned_to: string | null;
  created_at: string;
  assigned_agent?: { name: string; avatar_url: string | null };
  messages_count: number;
  last_message_at: string | null;
}

export interface QueueMetrics {
  totalContacts: number;
  assignedContacts: number;
  waitingContacts: number;
  // Fase 9 da auditoria UX (2026-09-24): antes eram valores fabricados
  // ('~3 min' fixo e 70% dos atribuídos) exibidos como se fossem métricas
  // reais — null sinaliza "ainda não calculado" até existir uma query real
  // de tempo de resposta / resolução por dia.
  avgResponseTime: string | null;
  resolvedToday: number | null;
}

export function useQueueDetails(id: string | undefined) {
  const [queue, setQueue] = useState<QueueDetailsData | null>(null);
  const [members, setMembers] = useState<QueueMember[]>([]);
  const [contacts, setContacts] = useState<QueueContact[]>([]);
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(
    async (isCancelled: () => boolean) => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);

        const { data: queueData, error: queueError } = await supabase
          .from('queues')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (queueError) throw queueError;
        if (isCancelled()) return;
        setQueue(queueData as QueueDetailsData | null);

        const { data: membersData } = await supabase
          .from('queue_members')
          .select('id, profile_id, profile:profiles(name, avatar_url, is_active)')
          .eq('queue_id', id);
        if (isCancelled()) return;
        setMembers((membersData ?? []) as unknown as QueueMember[]);

        const contactsRes = await dbFrom('contacts')
          .select('id, name, phone, avatar_url, assigned_to, created_at')
          .eq('queue_id', id)
          .order('created_at', { ascending: false })
          .limit(50);
        const contactsData = (contactsRes.data ?? []) as Array<{
          id: string;
          name: string;
          phone: string;
          avatar_url: string | null;
          assigned_to: string | null;
          created_at: string;
        }>;

        let contactsWithDetails: QueueContact[] = [];

        if (contactsData.length > 0) {
          const contactIds = contactsData.map((c) => c.id);
          const assignedToIds = Array.from(
            new Set(contactsData.map((c) => c.assigned_to).filter(Boolean) as string[])
          );

          const [messagesResult, agentResult] = await Promise.all([
            dbFrom('evolution_messages')
              .select('contact_id, created_at')
              .in('contact_id', contactIds)
              .order('created_at', { ascending: false }),
            assignedToIds.length > 0
              ? supabase.from('profiles').select('id, name, avatar_url').in('id', assignedToIds)
              : Promise.resolve({
                  data: [] as { id: string; name: string; avatar_url: string | null }[],
                }),
          ]);

          if (isCancelled()) return;

          const countMap = new Map<string, number>();
          const lastMessageMap = new Map<string, string>();
          const messages = (messagesResult.data ?? []) as Array<{
            contact_id: string;
            created_at: string;
          }>;
          messages.forEach((msg) => {
            countMap.set(msg.contact_id, (countMap.get(msg.contact_id) || 0) + 1);
            if (!lastMessageMap.has(msg.contact_id)) {
              lastMessageMap.set(msg.contact_id, msg.created_at);
            }
          });

          const agents = (agentResult.data ?? []) as Array<{
            id: string;
            name: string;
            avatar_url: string | null;
          }>;
          const agentMap = new Map(
            agents.map((p) => [p.id, { name: p.name, avatar_url: p.avatar_url }])
          );

          contactsWithDetails = contactsData.map((contact) => ({
            ...contact,
            messages_count: countMap.get(contact.id) || 0,
            last_message_at: lastMessageMap.get(contact.id) || null,
            assigned_agent: contact.assigned_to
              ? (agentMap.get(contact.assigned_to) ?? undefined)
              : undefined,
          }));
        }

        if (isCancelled()) return;
        setContacts(contactsWithDetails);

        const totalContacts = contactsWithDetails.length;
        const assignedContacts = contactsWithDetails.filter((c) => c.assigned_to).length;
        setMetrics({
          totalContacts,
          assignedContacts,
          waitingContacts: totalContacts - assignedContacts,
          avgResponseTime: null,
          resolvedToday: null,
        });
      } catch (err) {
        log.error('Error fetching queue data:', err);
        if (!isCancelled()) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetchAll(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [id, fetchAll]);

  const refetch = useCallback(() => {
    let cancelled = false;
    void fetchAll(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  return { queue, members, contacts, metrics, loading, error, refetch };
}
