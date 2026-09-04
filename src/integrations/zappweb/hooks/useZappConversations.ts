import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { zappSupabase, ZAPPWEB_INSTANCE } from '../supabaseClient';
import type { EvolutionConversation } from '../types';
import { getLogger } from '@/lib/logger';

const log = getLogger('useZappConversations');

const SELECT_FIELDS = `id, remote_jid, contact_id, status, unread_count, last_message_content,
   last_message_type, last_message_at, last_inbound_at, assigned_to,
   priority, instance_name,
   evolution_contacts ( id, push_name, full_name, phone_number,
     profile_picture_url, lead_status, company, tags )`;

// Fix 4b (P3): ISO timestamps são lexicograficamente ordenáveis — >/<
// são suficientes e mais rápidos que localeCompare (que aplica regras
// de locale desnecessárias em strings ISO 8601).
const sortByLastMessage = (rows: EvolutionConversation[]) =>
  [...rows].sort((a, b) => {
    const ta = a.last_message_at ?? '';
    const tb = b.last_message_at ?? '';
    return tb > ta ? 1 : tb < ta ? -1 : 0;
  });

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
  // Fix 2 (P2): useLayoutEffect para sincronizar o ref ANTES de qualquer
  // handler de evento que leia conversationsRef.current no mesmo frame de
  // render. useEffect corre DEPOIS do paint — um evento realtime que chega
  // entre o setState e o próximo paint leria o ref desatualizado (stale).
  useLayoutEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Review do cubic no PR #1514 (3ª rodada, 2 achados a essa altura P1/P2):
  // 1) fetchAll() fechava sobre instance/status/limit da renderização em que
  //    foi criado — se esses props mudassem enquanto um retry recursivo
  //    ainda rodava, o retry continuava usando os valores VELHOS (podendo
  //    sobrescrever o filtro novo, inclusive depois do unmount).
  // 2) `void fetchAll()` recursivo deixava chamadas concorrentes se
  //    perseguirem sem limite: cada resposta obsoleta disparava outra busca,
  //    cada uma avançando a geração antes da outra checar a sua.
  // Fix: fetchAll vira uma função ESTÁVEL (deps []) que lê instance/status/
  // limit sempre de optsRef (nunca de um closure velho), e um lock
  // (fetchInFlightRef) garante um único loop de reconciliação ativo por vez
  // — chamadas concorrentes só avançam a geração pro loop já em andamento
  // pegar na próxima iteração, nunca spawnam uma busca paralela.
  const optsRef = useRef({ instance, status, limit });
  // Achado do cubic (4ª rodada, P1): na última tentativa, aplicar o
  // resultado mesmo com a geração obsoleta podia sobrescrever um patch ou
  // remoção mais recente já aplicado em memória. hasLoadedOnceRef distingue
  // a 1ª carga (sem dado nenhum ainda — melhor mostrar algo desatualizado do
  // que ficar vazio pra sempre, com uma rodada extra agendada pra alcançar o
  // estado atual) de recargas subsequentes (já há dado, os patches locais já
  // mantêm a janela razoavelmente atual — não vale a pena arriscar regredir).
  // Reseta a cada troca de filtro: um instance/status/limit novo também
  // conta como "ainda não carregamos isso".
  const hasLoadedOnceRef = useRef(false);
  // Achado do coderabbit (PR #1514, rodada H): o caminho de erro (abaixo)
  // marcava hasLoadedOnceRef=true so pra parar de agendar rodada extra —
  // mas SEM nunca chamar setConversations. Se a rodada extra caísse no
  // caminho de SUCESSO com geração obsoleta, o guard "!hasLoadedOnceRef"
  // de lá já estava falso (por causa dessa marcação prematura) e o
  // fallback otimista nunca aplicava nada — sidebar ficava presa em
  // loading=false / conversations=[] / error=null, sem jeito de sair.
  // followUpAttemptedRef separa "já usei minha rodada extra" (evita loop
  // sem fim) de hasLoadedOnceRef, que passa a significar só "já mostrei
  // ALGO pro usuário" — condição que o caminho de sucesso continua usando
  // pra decidir se vale aplicar um snapshot obsoleto como fallback.
  const followUpAttemptedRef = useRef(false);
  useEffect(() => {
    optsRef.current = { instance, status, limit };
    hasLoadedOnceRef.current = false;
    followUpAttemptedRef.current = false;
  }, [instance, status, limit]);
  // Review do CodeRabbit no PR #1514: sob React 18 StrictMode (dev), o efeito
  // roda setup→cleanup→setup de novo — sem um `mountedRef.current = true` no
  // setup, o cleanup do 1º ciclo deixava o ref travado em `false` pro resto
  // da vida real do componente, quebrando fetchAll() silenciosamente.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const generationRef = useRef(0);
  const fetchInFlightRef = useRef(false);

  // Review do CodeRabbit: numa instância movimentada, INSERT/UPDATE/DELETE
  // avançam a geração a cada evento — sem um teto, o loop de reconciliação
  // podia girar indefinidamente (loading nunca libera) se a taxa de eventos
  // superasse a latência da query. Teto de tentativas + aplica o melhor
  // resultado disponível na última tentativa em vez de girar pra sempre (o
  // próximo evento incremental corrige qualquer defasagem residual).
  const MAX_FETCH_ATTEMPTS = 3;

  const fetchAll = useCallback(async () => {
    if (fetchInFlightRef.current) {
      generationRef.current += 1; // sinaliza pro loop já em andamento refazer
      return;
    }
    fetchInFlightRef.current = true;
    // Só populada quando a última tentativa esgota sem alcançar a geração
    // atual E ainda não tínhamos carregado nada (1ª carga) — disparada DEPOIS
    // do finally liberar o lock, nunca de dentro do loop (senão cairia direto
    // no branch "já em voo" acima e não faria nada).
    let needsFollowUpFetch = false;
    try {
      for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
        const myGeneration = generationRef.current;
        const { instance: curInstance, status: curStatus, limit: curLimit } = optsRef.current;
        const isLastAttempt = attempt === MAX_FETCH_ATTEMPTS - 1;
        try {
          const { data, error: err } = await zappSupabase
            .from('evolution_conversations_wpp2')
            .select(SELECT_FIELDS)
            .eq('instance_name', curInstance)
            .eq('status', curStatus)
            .order('last_message_at', { ascending: false })
            .limit(curLimit);
          if (err) throw err;
          if (!mountedRef.current) return;
          const isLatest = generationRef.current === myGeneration;
          if (isLatest) {
            setConversations((data ?? []) as unknown as EvolutionConversation[]);
            setError(null);
            hasLoadedOnceRef.current = true;
            break;
          }
          if (isLastAttempt) {
            if (!hasLoadedOnceRef.current) {
              // Fix BUG #1 (P1 — race condition agent): curInstance/curStatus
              // foram capturados no início do attempt; a rede é lenta e os
              // parâmetros podem ter mudado durante o round-trip. Só escreve
              // se os parâmetros ainda batem — evita exibir conversas do
              // status errado por ~300-500ms na janela de switching.
              const { instance: nowInstance, status: nowStatus } = optsRef.current;
              if (curInstance === nowInstance && curStatus === nowStatus) {
                setConversations((data ?? []) as unknown as EvolutionConversation[]);
                setError(null);
                hasLoadedOnceRef.current = true;
              }
              // Independente da paridade: agenda rodada extra para alcançar
              // a geração atual (params mudaram ou dados desatualizados).
              needsFollowUpFetch = true;
            }
            // Já tínhamos dado real: os patches locais (INSERT/UPDATE/DELETE)
            // já mantêm a janela razoavelmente atual — não arrisca regredir
            // sobrescrevendo com este snapshot obsoleto.
            break;
          }
          // Geração avançou e ainda sobram tentativas — repete no MESMO loop
          // (nunca spawna uma chamada concorrente) com os valores atuais.
        } catch (e: unknown) {
          if (!mountedRef.current) return;
          // Achado do cubic: se um refetch()/troca de props chegou ENQUANTO
          // esta tentativa falhava, a geração já avançou — trata como pedido
          // de nova busca em vez de propagar este erro específico e perder o
          // pedido concorrente.
          if (generationRef.current !== myGeneration) {
            if (!isLastAttempt) {
              log.warn('[useZappConversations] retry após erro (refetch concorrente)', e);
              continue;
            }
            // Achado do cubic (2ª rodada): agendar rodada extra aqui sem o
            // mesmo teto do caminho de sucesso reabria o risco original —
            // eventos realtime sustentados + falhas intermitentes podiam
            // encadear follow-ups indefinidamente. Só agenda na 1ª carga
            // (mesma proteção de hasLoadedOnceRef); depois de já termos dado
            // real, propaga o erro normalmente — os patches locais bastam.
            if (!hasLoadedOnceRef.current && !followUpAttemptedRef.current) {
              log.warn(
                '[useZappConversations] última tentativa falhou com refetch concorrente pendente (1ª carga) — agenda nova rodada',
                e
              );
              followUpAttemptedRef.current = true;
              needsFollowUpFetch = true;
              break;
            }
          }
          log.error('[useZappConversations]', e);
          setError(e instanceof Error ? e.message : String(e));
          break;
        }
      }
    } finally {
      fetchInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
    if (needsFollowUpFetch && mountedRef.current) void fetchAll();
  }, []);

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
    // Achado do coderabbit (PR #1514, rodada I): os handlers de INSERT/UPDATE
    // são async e fecham sobre o `status`/`fetchOne` desta execução do efeito.
    // ch.unsubscribe() no cleanup não cancela um callback que já começou —
    // se instance/status mudar enquanto um `await fetchOne(...)` está em voo,
    // o callback da assinatura VELHA ainda completa e pode inserir uma
    // conversa do filtro antigo no estado atual. isSubscriptionActive garante
    // que só o callback da assinatura vigente aplica o resultado.
    let isSubscriptionActive = true;
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
          // Fix B (P1): guarda de tipo em runtime antes de usar o payload —
          // o Supabase Realtime não garante o shape exato de `payload.new`.
          const row = payload.new as Record<string, unknown>;
          if (typeof row.id !== 'string') return;
          if (row.status !== status) return;
          const full = await fetchOne(row.id);
          if (!isSubscriptionActive) return;
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
          // Fix B (P1): guarda de tipo — ver comentário no INSERT handler.
          const row = payload.new as Record<string, unknown>;
          // Fix: mesma relaxação do INSERT — status: null deve fluir para
          // o check `willRemove` (null !== status → willRemove=true → remove).
          if (typeof row.id !== 'string') return;
          const exists = conversationsRef.current.some((c) => c.id === row.id);
          if (exists) {
            const willRemove = row.status !== status;
            // Janela cheia + remoção: sobrou vaga no top-N que só um refetch
            // acha (review do cubic — a próxima conversa elegível nunca
            // entrava sozinha).
            const wasFull = conversationsRef.current.length === limit;
            // Avança a geração em todo UPDATE de uma conversa existente.
            // Fix CodeRabbit (Major): mesmo em UPDATEs in-place (willRemove=false),
            // um fetchAll() em voo com a geração anterior sobrescreveria o patch
            // local ao resolver (linha 148: `generationRef.current === myGeneration`
            // ainda true). Avançar aqui descarta qualquer resposta em trânsito
            // sem disparar um novo refetch (só willRemove && wasFull faz isso).
            generationRef.current += 1;
            setConversations((prev) => {
              const idx = prev.findIndex((c) => c.id === row.id);
              if (idx === -1) return prev;
              if (willRemove) {
                // Fix 3 (P3): bail-out se o item já não está (possível race).
                const next = prev.filter((c) => c.id !== row.id);
                return next.length === prev.length ? prev : next;
              }
              const next = [...prev];
              next[idx] = { ...next[idx], ...(row as Partial<EvolutionConversation>) };
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
          if (!isSubscriptionActive) return;
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
          // Fix B (P1): guarda de tipo — ver comentário no INSERT handler.
          const oldRow = payload.old as Record<string, unknown>;
          if (typeof oldRow.id !== 'string') return;
          const hadIt = conversationsRef.current.some((c) => c.id === oldRow.id);
          if (!hadIt) return;
          const wasFull = conversationsRef.current.length === limit;
          generationRef.current += 1;
          // Fix 3 (P3): bail-out se o item já não estava (race entre
          // DELETE realtime e um refetch que já removeu a linha).
          setConversations((prev) => {
            const next = prev.filter((c) => c.id !== oldRow.id);
            return next.length === prev.length ? prev : next;
          });
          if (wasFull) void fetchAll();
        }
      )
      .subscribe();
    return () => {
      isSubscriptionActive = false;
      // Fix CodeRabbit (Minor): removeChannel() já chama unsubscribe()
      // internamente — a chamada explícita era redundante (duplo unsubscribe).
      // removeChannel() retorna Promise; .catch() captura rejeições assíncronas
      // que um try/catch síncrono não alcança.
      // Promise.resolve() normaliza o retorno caso o mock/SDK retorne
      // undefined (cubic P2): evita "TypeError: .catch is not a function".
      void Promise.resolve(zappSupabase.removeChannel(ch)).catch(() => {
        // cleanup assíncrono falhou; ignorado — canal já invalidado por
        // isSubscriptionActive=false e React já desmontou o componente.
      });
    };
  }, [instance, status, limit, fetchAll, fetchOne]);

  const markAsRead = useCallback(async (conversationId: string) => {
    await zappSupabase.rpc('rpc_mark_conversation_read', { p_id: conversationId });
  }, []);

  return { conversations, loading, error, refetch: fetchAll, markAsRead };
}
