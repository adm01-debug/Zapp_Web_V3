import { useEffect, useState, useCallback, useRef } from 'react';
import { zappSupabase, ZAPPWEB_INSTANCE } from '../supabaseClient';
import type { EvolutionMessage } from '../types';
import { log } from '@/lib/logger';
import { evolutionMessageRowSchema, isContractErrorResponse, safeParseEvent } from '@/shared/webhookEventSchemas';

interface Options {
  remoteJid: string | null;
  instance?: string;
  limit?: number;
}

const SELECT_FIELDS = `id, message_id, remote_jid, from_me, message_type, content, media_url,
   media_mimetype, media_type, caption, quoted_message_id, status,
   push_name, created_at, deleted_at, edited_at, instance_name,
   contact_id, conversation_id`;

/**
 * Carrega mensagens de uma conversa + Realtime (INSERT/UPDATE).
 * UPDATE cobre: media_url preenchida pelo proxy, status sent→delivered→read,
 * deleted_at preenchido.
 *
 * Auditoria 22D (item #6, 2026-09-02): `limit` era fixo — não havia como
 * carregar mensagens mais antigas que as últimas `limit`. `loadOlder()`
 * pagina por cursor (`created_at` da mensagem mais antiga carregada) e
 * prepend no início da lista, sem afetar o realtime (que continua
 * patcheando em memória via INSERT/UPDATE, nunca refetch da lista).
 */
export function useZappMessages({ remoteJid, instance = ZAPPWEB_INSTANCE, limit = 50 }: Options) {
  const [messages, setMessages] = useState<EvolutionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof zappSupabase.channel> | null>(null);
  // Review do Copilot + cubic no PR #1514: sem isso, uma troca de conversa
  // (remoteJid, instance OU limit) enquanto loadOlder() está em voo faz o
  // resultado antigo poluir a conversa nova (setMessages resolve depois do
  // fetchAll da nova conversa já ter rodado). Geração incrementada a cada
  // troca — mais robusto que comparar só remoteJid.
  const queryGenerationRef = useRef(0);
  useEffect(() => {
    queryGenerationRef.current += 1;
    // Achado do cubic: sem isso, um erro de loadOlder() na conversa A
    // (ex.: falha de rede) sobrevivia à troca pra conversa B — a mensagem de
    // erro velha aparecia embaixo do botão da conversa nova até o fetchAll()
    // de B resolver.
    setError(null);
  }, [remoteJid, instance, limit]);

  const fetchAll = useCallback(async () => {
    if (!remoteJid) {
      setMessages([]);
      setHasMore(true);
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await zappSupabase
        .from('evolution_messages_wpp2')
        .select(SELECT_FIELDS)
        .eq('instance_name', instance)
        .eq('remote_jid', remoteJid)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (err) throw err;
      const rows = (data ?? []) as unknown as EvolutionMessage[];
      // ordenar ascendente para UI tipo chat
      setMessages(rows.slice().reverse());
      setHasMore(rows.length === limit);
      setError(null);
    } catch (e: unknown) {
      log.error('[useZappMessages]', e);
      if (isContractErrorResponse(e)) {
        // Envelope 422 canônico do contract-kit (docs/CONTRACT_TESTING.md):
        // a mensagem do backend já é amigável e a falha é de CONTRATO —
        // retry não corrige payload inválido, então não há retentativa
        // automática (só refetch manual do usuário).
        setError(e.message);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [remoteJid, instance, limit]);

  const loadOlder = useCallback(async () => {
    if (!remoteJid || loadingMore || !hasMore) return;
    const oldest = messages[0]?.created_at;
    if (!oldest) return;
    const requestGeneration = queryGenerationRef.current;
    setLoadingMore(true);
    try {
      const { data, error: err } = await zappSupabase
        .from('evolution_messages_wpp2')
        .select(SELECT_FIELDS)
        .eq('instance_name', instance)
        .eq('remote_jid', remoteJid)
        .is('deleted_at', null)
        // Cursor simples por created_at (sem tiebreaker de id): mensagens com
        // o exato mesmo timestamp que `oldest` (raro, rajada de webhook) podem
        // ficar de fora desta página — aceitável para o volume desta conversa.
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (err) throw err;
      if (queryGenerationRef.current !== requestGeneration) return; // remoteJid/instance trocou durante o fetch
      const rows = ((data ?? []) as unknown as EvolutionMessage[]).slice().reverse();
      setMessages((prev) => [...rows, ...prev]);
      setHasMore(rows.length === limit);
      // Achado do cubic: sem isso, um erro de uma tentativa anterior ficava
      // preso em `error` mesmo depois de uma página seguinte carregar bem.
      setError(null);
    } catch (e: unknown) {
      log.error('[useZappMessages] loadOlder', e);
      // Achado do CodeRabbit: sem isso, o erro só ia pro log — o usuário
      // clicava em "carregar mais antigas" e nada acontecia na tela.
      if (queryGenerationRef.current === requestGeneration) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      // Sempre reseta, mesmo se a conversa mudou: senão loadingMore trava em
      // true e loadOlder() da conversa nova vira no-op permanente (guard da
      // linha 76).
      setLoadingMore(false);
    }
  }, [remoteJid, instance, limit, messages, loadingMore, hasMore]);

  useEffect(() => {
    void fetchAll();
    if (!remoteJid) return;

    const ch = zappSupabase
      .channel(`zapp:messages:${instance}:${remoteJid}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'evo',
          // publish_via_partition_root=true: events are published from the root
          // table, never from partitions. evolution_messages_wpp2 would be silent.
          table: 'evolution_messages',
          filter: `instance_name=eq.${instance}`,
        },
        (payload) => {
          const parsed = safeParseEvent(evolutionMessageRowSchema, payload.new);
          if (!parsed.ok) {
            log.warn('[useZappMessages] INSERT payload rejeitado', parsed.error);
            return;
          }
          const msg = parsed.data as unknown as EvolutionMessage; // ignore-audit: narrows Supabase query result to local interface
          if (msg.remote_jid !== remoteJid) return;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo',
          // publish_via_partition_root=true: use root table for realtime
          table: 'evolution_messages',
          filter: `instance_name=eq.${instance}`,
        },
        (payload) => {
          const parsed = safeParseEvent(evolutionMessageRowSchema, payload.new);
          if (!parsed.ok) {
            log.warn('[useZappMessages] UPDATE payload rejeitado', parsed.error);
            return;
          }
          const upd = parsed.data as unknown as EvolutionMessage; // ignore-audit: narrows Supabase query result to local interface
          if (upd.remote_jid !== remoteJid) return;
          setMessages((prev) => prev.map((m) => (m.id === upd.id ? { ...m, ...upd } : m)));
        }
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        zappSupabase.removeChannel(channelRef.current);
      }
    };
  }, [remoteJid, instance, fetchAll]);

  return { messages, loading, error, refetch: fetchAll, loadOlder, loadingMore, hasMore };
}
