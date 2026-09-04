import { useEffect, useState, useCallback, useRef } from 'react';
import { zappSupabase, ZAPPWEB_INSTANCE } from '../supabaseClient';
import type { EvolutionConversation } from '../types';
import { getLogger } from '@/lib/logger';

const log = getLogger('useZappConversations');

const SELECT_FIELDS = `id, remote_jid, contact_id, status, unread_count, last_message_content,
   last_message_type, last_message_at, last_inbound_at, assigned_to,
   priority, instance_name,
   evolution_contacts ( id, push_name, full_name, phone_number,
     profile_picture_url, lead_status, company, tags )`;

const sortByLastMessage = (rows: EvolutionConversation[]) =>
  [...rows].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));

interface Options {
  instance?: string;
  status?: 'aberta' | 'arquivada';
  limit?: number;
}

/**
 * Lista conversas (sidebar) com dados embutidos do contato + Realtime
 * para reatualização imediata em INSERT/UPDATE/DELETE.
 *
 * Auditoria 22D (item #6, 2026-09-02): eventos realtime patcheiam o item
 * afetado em memória em vez de refazer a query inteira. Só dispara um
 * fetch de UMA linha (com o join de contato) quando o evento é de uma
 * conversa que ainda não está na janela local (INSERT novo, ou UPDATE de
 * conversa fora do top-`limit` que agora deveria entrar) — nunca refetch
 * da lista inteira.
 */
export function useZappConversations(opts: Options = {}) {
  const instance = opts.instance ?? ZAPPWEB_INSTANCE;
  const status = opts.status ?? 'aberta';
  const limit = opts.limit ?? 50;

  const [conversations, setConversations] = useState<EvolutionConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const conversationsRef = useRef<EvolutionConversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  // Review do cubic no PR #1514 (2ª rodada, 2 achados P1): um boolean
  // compartilhado não basta — se um SEGUNDO fetchAll() começar enquanto o
  // primeiro ainda está em voo (refetch manual, ou o backfill disparado por
  // uma remoção), o reset no início do segundo apaga o "sujo" do primeiro, e
  // o primeiro pode aplicar um snapshot desatualizado por cima. E descartar
  // o snapshot inteiro (em vez de reconciliar) podia esconder a lista toda
  // atrás de só 1 linha se um evento chegasse durante a carga inicial.
  // Contador de geração: cada fetchAll() e cada mutação incremental avança a
  // geração; se algo mudou entre o início da query e a resposta, refaz a
  // busca (nunca descarta em silêncio) até convergir sem concorrência.
  const generationRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const myGeneration = ++generationRef.current;
    try {
      const { data, error: err } = await zappSupabase
        .from('evolution_conversations_wpp2')
        .select(SELECT_FIELDS)
        .eq('instance_name', instance)
        .eq('status', status)
        .order('last_message_at', { ascending: false })
        .limit(limit);
      if (err) throw err;
      if (generationRef.current !== myGeneration) {
        // Outro fetchAll() ou uma mutação incremental aconteceu durante esta
        // query — o snapshot recebido já pode estar desatualizado. Busca de
        // novo em vez de descartar ou aplicar por cima do que já é mais novo.
        void fetchAll();
        return;
      }
      setConversations((data ?? []) as unknown as EvolutionConversation[]);
      setError(null);
      setLoading(false);
    } catch (e: unknown) {
      log.error('[useZappConversations]', e);
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [instance, status, limit]);

  const fetchOne = useCallback(async (id: string): Promise<EvolutionConversation | null> => {
    // Entre o evento e este SELECT a conversa pode ter mudado de instância/status
    // (TOCTOU) — refiltra pra não inserir uma linha fora da janela atual.
    const { data, error: err } = await zappSupabase
      .from('evolution_conversations_wpp2')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .eq('instance_name', instance)
      .eq('status', status)
      .maybeSingle();
    if (err || !data) return null;
    return data as unknown as EvolutionConversation;
  }, [instance, status]);

  useEffect(() => {
    void fetchAll();

    const insertIfAbsent = (row: EvolutionConversation) => {
      generationRef.current += 1;
      setConversations((prev) =>
        prev.some((c) => c.id === row.id) ? prev : sortByLastMessage([...prev, row]).slice(0, limit)
      );
    };

    const ch = zappSupabase
      .channel(`zapp:conversations:${instance}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'evo',
          // publish_via_partition_root=true: must subscribe to root table.
          // evolution_conversations_wpp2 (partition) emits zero realtime events.
          table: 'evolution_conversations',
          filter: `instance_name=eq.${instance}`,
        },
        async (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (!row.id || row.status !== status) return;
          const full = await fetchOne(row.id);
          if (full) insertIfAbsent(full);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo',
          table: 'evolution_conversations',
          filter: `instance_name=eq.${instance}`,
        },
        async (payload) => {
          const row = payload.new as Partial<EvolutionConversation> & { id: string; status: string };
          const exists = conversationsRef.current.some((c) => c.id === row.id);
          if (exists) {
            const willRemove = row.status !== status;
            // Janela cheia + remoção: sobrou vaga no top-N que só um refetch
            // acha (review do cubic — a próxima conversa elegível nunca
            // entrava sozinha).
            const wasFull = conversationsRef.current.length === limit;
            generationRef.current += 1;
            setConversations((prev) => {
              const idx = prev.findIndex((c) => c.id === row.id);
              if (idx === -1) return prev;
              if (willRemove) return prev.filter((c) => c.id !== row.id);
              const next = [...prev];
              next[idx] = { ...next[idx], ...row };
              return sortByLastMessage(next);
            });
            if (willRemove && wasFull) void fetchAll();
            return;
          }
          // Fora da janela local hoje (ex.: passou de "arquivada" para "aberta",
          // ou um reordenamento por last_message_at a traria pro top-N) — busca
          // só essa linha, nunca a lista inteira.
          if (row.status !== status) return;
          const full = await fetchOne(row.id);
          if (full) insertIfAbsent(full);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'evo',
          table: 'evolution_conversations',
          filter: `instance_name=eq.${instance}`,
        },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (!oldRow.id) return;
          const hadIt = conversationsRef.current.some((c) => c.id === oldRow.id);
          if (!hadIt) return;
          const wasFull = conversationsRef.current.length === limit;
          generationRef.current += 1;
          setConversations((prev) => prev.filter((c) => c.id !== oldRow.id));
          if (wasFull) void fetchAll();
        }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
      zappSupabase.removeChannel(ch);
    };
  }, [instance, status, limit, fetchAll, fetchOne]);

  const markAsRead = useCallback(async (conversationId: string) => {
    await zappSupabase.rpc('rpc_mark_conversation_read', { p_id: conversationId });
  }, []);

  return { conversations, loading, error, refetch: fetchAll, markAsRead };
}
