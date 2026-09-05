import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { createMockSupabase } from '@/test/mocks/supabase';
import { useZappConversations } from '../useZappConversations';
import { ZAPPWEB_INSTANCE } from '../../supabaseClient';

type MockClient = ReturnType<typeof createMockSupabase>;

// Holder populado pela factory do vi.mock (roda antes dos imports do módulo).
const supabaseMock = vi.hoisted(() => ({
  client: null as unknown as MockClient,
  convRows: [] as unknown[],
}));

// Mock do client principal (re-exportado como zappSupabase pelo supabaseClient).
vi.mock('@/integrations/supabase/client', async () => {
  const { createMockSupabase } =
    await vi.importActual<typeof import('@/test/mocks/supabase')>('@/test/mocks/supabase');
  supabaseMock.client = createMockSupabase({
    tables: { evolution_conversations_wpp2: { data: supabaseMock.convRows } },
  });
  return { supabase: supabaseMock.client };
});

const CONV_FIXTURE = {
  id: '00000000-0000-4000-8000-0000000000a1',
  remote_jid: '5511999990001@s.whatsapp.net',
  contact_id: null,
  status: 'aberta',
  unread_count: 2,
  last_message_content: 'oi',
  last_message_type: 'text',
  last_message_at: '2026-08-04T12:00:00Z',
  last_inbound_at: null,
  assigned_to: null,
  priority: 0,
  instance_name: ZAPPWEB_INSTANCE,
  evolution_contacts: [{ id: 'c1', push_name: 'Alice', phone_number: '5511999990001' }],
};

function convRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ ...CONV_FIXTURE, id: `${i}` }));
}

// Nitpick do cubic: helpers de builder duplicados inline em cada teste de
// corrida — hoisted aqui pra reuso (não têm estado próprio).
type QueryResult = { data: unknown; error: unknown };
function pendingBuilder() {
  let resolve!: (v: QueryResult) => void;
  const promise = new Promise<QueryResult>((r) => {
    resolve = r;
  });
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (onFulfilled: (v: QueryResult) => unknown) => promise.then(onFulfilled),
  };
  return { builder, resolve };
}
function syncBuilder(data: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve({ data, error: null }).then(onFulfilled),
  };
  return builder;
}

beforeEach(() => {
  // Review do cubic (PR #1514): channel() usa mockReturnValue — 1 objeto único
  // reutilizado pra suíte inteira — então os spies aninhados (.on/.subscribe)
  // acumulam entre testes se não forem limpos ANTES do channel.mockClear() de
  // baixo (que só limpa .mock.calls/.results do channel() em si, não os spies
  // do objeto que ele retorna).
  const prevResults = supabaseMock.client.channel?.mock.results ?? [];
  const prevChannel = prevResults[prevResults.length - 1]?.value as
    | { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }
    | undefined;
  prevChannel?.on.mockClear();
  prevChannel?.subscribe.mockClear();

  supabaseMock.convRows.length = 0;
  supabaseMock.convRows.push(...convRows(2));
  supabaseMock.client.from.mockClear();
  supabaseMock.client.channel.mockClear();
  supabaseMock.client.schema.mockClear();
  supabaseMock.client.removeChannel.mockClear();
});

describe('useZappConversations (fix: hooks zappweb sem .schema("evo"))', () => {
  it('carrega conversas direto de evolution_conversations_wpp2 sem passar por .schema("evo")', async () => {
    const { result } = renderHook(() => useZappConversations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.conversations[0].instance_name).toBe(ZAPPWEB_INSTANCE);

    // NUNCA chamar .schema no client (schema 'evo' fora de PGRST_DB_SCHEMAS → PGRST106)
    expect(supabaseMock.client.schema).not.toHaveBeenCalled();

    // Query via from() direto na tabela (vista pelo PostgREST)
    expect(supabaseMock.client.from).toHaveBeenCalledWith('evolution_conversations_wpp2');

    // Chain completa: select (com join de contatos) → eq instance → eq status → order → limit
    const builder = supabaseMock.client.from.mock.results[0].value;
    expect(builder.schema).toBeUndefined(); // a chain NÃO possui método .schema
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('evolution_contacts'));
    expect(builder.eq).toHaveBeenCalledWith('instance_name', ZAPPWEB_INSTANCE);
    expect(builder.eq).toHaveBeenCalledWith('status', 'aberta');
    expect(builder.order).toHaveBeenCalledWith('last_message_at', { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(50);
  });

  it('usa Realtime com schema "evo" APENAS na config do channel (obrigatório p/ partição root), nunca no query builder', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(supabaseMock.client.channel).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^zapp:conversations:${ZAPPWEB_INSTANCE}(:[a-z0-9]+)?$`))
    );
    const channel = supabaseMock.client.channel.mock.results[0].value;
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        schema: 'evo',
        table: 'evolution_conversations',
        filter: `instance_name=eq.${ZAPPWEB_INSTANCE}`,
      }),
      expect.any(Function)
    );
    expect(channel.subscribe).toHaveBeenCalled();
    // Hook expõe refetch para consumidores
    expect(typeof result.current.refetch).toBe('function');
  });

  it('markAsRead chama rpc_mark_conversation_read sem .schema (F3/V3)', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markAsRead('00000000-0000-4000-8000-0000000000a1');
    });

    expect(supabaseMock.client.schema).not.toHaveBeenCalled();
    expect(supabaseMock.client.rpc).toHaveBeenCalledWith('rpc_mark_conversation_read', {
      p_id: '00000000-0000-4000-8000-0000000000a1',
    });
  });

  it('refetch recarrega a lista', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = supabaseMock.client.from.mock.calls.length;

    await act(async () => {
      await result.current.refetch();
    });

    expect(supabaseMock.client.from.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(result.current.conversations).toHaveLength(2);
  });
});

// A factory de vi.mock() cria UM único objeto de canal reutilizado por
// channel() em toda a suíte (mockReturnValue), então channel.on.mock.calls
// ACUMULA entre testes — sempre pega o registro mais recente (deste
// renderHook), nunca o primeiro que casar com o evento.
function latestHandlerFor(channel: { on: ReturnType<typeof vi.fn> }, event: string) {
  const calls = channel.on.mock.calls.filter((c: unknown[]) => (c[1] as { event: string }).event === event);
  const last = calls[calls.length - 1] as [unknown, unknown, (payload: unknown) => unknown];
  return last[2];
}

describe('useZappConversations — patch incremental de Realtime (auditoria 22D, item #6)', () => {
  it('registra INSERT/UPDATE/DELETE separados (não mais um único listener event:"*")', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const channel = supabaseMock.client.channel.mock.results[0].value;
    // beforeEach limpa os spies aninhados do canal compartilhado — nesta altura
    // channel.on.mock.calls só tem as chamadas DESTE render. Array completo
    // (não slice(-3)) trava a regressão que o cubic apontou: um `event: '*'`
    // reintroduzido apareceria como um 4º item e quebraria o toEqual.
    const events = channel.on.mock.calls.map((c: unknown[]) => (c[1] as { event: string }).event);
    expect(events).toEqual(['INSERT', 'UPDATE', 'DELETE']);
  });

  it('UPDATE de conversa já carregada faz patch em memória — sem refetch da lista inteira', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const fromCallsBefore = supabaseMock.client.from.mock.calls.length;

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const updateHandler = latestHandlerFor(channel, 'UPDATE');

    await act(async () => {
      await updateHandler({
        new: { id: '0', last_message_content: 'nova mensagem', last_message_at: '2026-08-05T00:00:00Z', status: 'aberta' },
      });
    });

    expect(result.current.conversations.find((c) => c.id === '0')?.last_message_content).toBe(
      'nova mensagem'
    );
    // Patch em memória via payload.new — nenhuma chamada extra a from() (regressão do refetch total)
    expect(supabaseMock.client.from.mock.calls.length).toBe(fromCallsBefore);
  });

  it('UPDATE que muda status pra fora do filtro atual remove a conversa da lista', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const updateHandler = latestHandlerFor(channel, 'UPDATE');

    await act(async () => {
      await updateHandler({ new: { id: '0', status: 'arquivada' } });
    });

    expect(result.current.conversations.find((c) => c.id === '0')).toBeUndefined();
    expect(result.current.conversations).toHaveLength(1);
  });

  it('DELETE remove a conversa da lista em memória', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toHaveLength(2);

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const deleteHandler = latestHandlerFor(channel, 'DELETE');

    act(() => {
      void deleteHandler({ old: { id: '0' } });
    });

    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.conversations.find((c) => c.id === '0')).toBeUndefined();
  });

  it('INSERT de conversa nova busca só essa linha (fetchOne), não recarrega a lista inteira', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const fromCallsBefore = supabaseMock.client.from.mock.calls.length;

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const insertHandler = latestHandlerFor(channel, 'INSERT');

    await act(async () => {
      await insertHandler({ new: { id: 'nova-conversa', status: 'aberta' } });
    });

    // Fez exatamente 1 chamada adicional (fetchOne da conversa nova) — não um
    // refetch da lista (que geraria uma query com .order()/.limit() de novo
    // mas continuaria sendo 1 chamada a from() de qualquer forma; o que este
    // teste trava é que o handler realmente dispara uma busca direcionada).
    expect(supabaseMock.client.from.mock.calls.length).toBe(fromCallsBefore + 1);
    expect(supabaseMock.client.from).toHaveBeenLastCalledWith('evolution_conversations_wpp2');

    // Achado do cubic (PR #1514): fetchOne() tem que refiltrar por
    // instance_name/status, não só id — TOCTOU entre o evento e o SELECT.
    const fetchOneBuilder = supabaseMock.client.from.mock.results[fromCallsBefore].value;
    expect(fetchOneBuilder.eq).toHaveBeenCalledWith('instance_name', ZAPPWEB_INSTANCE);
    expect(fetchOneBuilder.eq).toHaveBeenCalledWith('status', 'aberta');
  });

  it('achado do coderabbit (PR #1514, rodada I): troca de status durante um INSERT em voo não insere conversa do filtro antigo', async () => {
    const { result, rerender } = renderHook(
      (props: { status?: 'aberta' | 'arquivada' }) => useZappConversations(props),
      { initialProps: { status: 'aberta' } as { status?: 'aberta' | 'arquivada' } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const insertHandler = latestHandlerFor(channel, 'INSERT'); // handler da assinatura ANTIGA (status: 'aberta')

    // fetchOne() da conversa nova fica pendente — dá tempo da troca de status
    // rodar o cleanup do efeito (unsubscribe) ANTES do handler terminar.
    let resolveFetchOne!: (v: { data: unknown; error: unknown }) => void;
    const pendingFetchOne = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      resolveFetchOne = resolve;
    });
    const fetchOneBuilder = {
      select: () => fetchOneBuilder,
      eq: () => fetchOneBuilder,
      maybeSingle: () => pendingFetchOne,
    };
    // Ordem das próximas 2 chamadas a from(): 1) fetchOne() do handler velho
    // (fica pendente); 2) fetchAll() disparado pela nova assinatura no
    // rerender (nenhuma conversa arquivada — resultado real esperado).
    supabaseMock.client.from
      .mockImplementationOnce(() => fetchOneBuilder as never)
      .mockImplementationOnce(() => syncBuilder([]) as never);

    let insertHandled: Promise<void> | undefined;
    act(() => {
      insertHandled = insertHandler({ new: { id: 'straggler', status: 'aberta' } }) as unknown as Promise<void>;
    });

    // Troca o filtro ANTES do fetchOne resolver — dispara cleanup (unsubscribe
    // do canal velho) e re-assina com um novo closure de status.
    rerender({ status: 'arquivada' });
    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual([]));

    // Só agora o fetchOne da assinatura VELHA resolve — sem o guard de
    // assinatura ativa, isso inseriria 'straggler' na lista mesmo depois da
    // troca de filtro (a conversa nunca deveria aparecer sob status: 'arquivada').
    await act(async () => {
      resolveFetchOne({ data: { ...CONV_FIXTURE, id: 'straggler', status: 'aberta' }, error: null });
      await insertHandled;
    });

    expect(result.current.conversations.find((c) => c.id === 'straggler')).toBeUndefined();
  });

  it('achado do cubic (PR #1514): DELETE com a janela cheia dispara refetch pra repor a vaga no top-N', async () => {
    supabaseMock.convRows.length = 0;
    supabaseMock.convRows.push(...convRows(2));

    const { result } = renderHook(() => useZappConversations({ limit: 2 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations.map((c) => c.id)).toEqual(['0', '1']); // janela cheia (== limit)

    const fromCallsBefore = supabaseMock.client.from.mock.calls.length;
    // Builder isolado pro refetch de backfill: NÃO reusa supabaseMock.convRows
    // (o state atual já referencia esse array por identidade — mutar em
    // place o "contaminaria" sem passar pelo setConversations do React).
    const backfillRows = convRows(2).map((c) => ({ ...c, id: `novo-${c.id}` }));
    const backfillBuilder = {
      select: () => backfillBuilder,
      eq: () => backfillBuilder,
      order: () => backfillBuilder,
      limit: () => backfillBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: backfillRows, error: null }).then(onFulfilled),
    };
    supabaseMock.client.from.mockImplementationOnce(() => backfillBuilder as never);

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const deleteHandler = latestHandlerFor(channel, 'DELETE');

    await act(async () => {
      await deleteHandler({ old: { id: '0' } });
    });

    // A janela estava cheia → sem isso a próxima conversa elegível nunca entraria sozinha.
    expect(supabaseMock.client.from.mock.calls.length).toBeGreaterThan(fromCallsBefore);
    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual(['novo-0', 'novo-1']));
  });

  // Nitpick do CodeRabbit: o caminho equivalente do DELETE (teste acima)
  // tinha cobertura, o do UPDATE-pra-fora-do-filtro com a janela cheia não.
  it('achado do CodeRabbit: UPDATE que remove com a janela cheia também dispara refetch de backfill', async () => {
    supabaseMock.convRows.length = 0;
    supabaseMock.convRows.push(...convRows(2));

    const { result } = renderHook(() => useZappConversations({ limit: 2 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations.map((c) => c.id)).toEqual(['0', '1']); // janela cheia (== limit)

    const fromCallsBefore = supabaseMock.client.from.mock.calls.length;
    const backfillRows = convRows(2).map((c) => ({ ...c, id: `novo-${c.id}` }));
    const backfillBuilder = {
      select: () => backfillBuilder,
      eq: () => backfillBuilder,
      order: () => backfillBuilder,
      limit: () => backfillBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: backfillRows, error: null }).then(onFulfilled),
    };
    supabaseMock.client.from.mockImplementationOnce(() => backfillBuilder as never);

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const updateHandler = latestHandlerFor(channel, 'UPDATE');

    await act(async () => {
      await updateHandler({ new: { id: '0', status: 'arquivada' } });
    });

    expect(supabaseMock.client.from.mock.calls.length).toBeGreaterThan(fromCallsBefore);
    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual(['novo-0', 'novo-1']));
  });

  it('achado do cubic (PR #1514, P1): fetchAll() inicial obsoleto refaz a busca (nunca descarta o snapshot inteiro)', async () => {
    let resolveInitialFetch!: (v: { data: unknown; error: unknown }) => void;
    const pendingInitialFetch = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      resolveInitialFetch = resolve;
    });
    const staleBuilder = {
      select: () => staleBuilder,
      eq: () => staleBuilder,
      order: () => staleBuilder,
      limit: () => staleBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        pendingInitialFetch.then(onFulfilled),
    };
    const insertRowBuilder = {
      select: () => insertRowBuilder,
      eq: () => insertRowBuilder,
      maybeSingle: () => Promise.resolve({ data: { ...CONV_FIXTURE, id: 'incremental' }, error: null }),
    };
    // A busca de retry (achado P1: descartar o snapshot inteiro sem
    // reconciliar podia deixar a sidebar mostrando só a linha do evento pra
    // sempre) precisa devolver o estado JÁ reconciliado — como aconteceria
    // numa query real feita depois do INSERT já commitado no banco.
    const reconciledBuilder = {
      select: () => reconciledBuilder,
      eq: () => reconciledBuilder,
      order: () => reconciledBuilder,
      limit: () => reconciledBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({
          data: [...convRows(2), { ...CONV_FIXTURE, id: 'incremental' }],
          error: null,
        }).then(onFulfilled),
    };
    // 1ª chamada a from() = fetchAll inicial (fica pendente); 2ª = fetchOne do
    // INSERT abaixo; 3ª = retry do fetchAll (geração obsoleta) já reconciliado.
    supabaseMock.client.from
      .mockImplementationOnce(() => staleBuilder as never)
      .mockImplementationOnce(() => insertRowBuilder as never)
      .mockImplementationOnce(() => reconciledBuilder as never);

    const { result } = renderHook(() => useZappConversations());
    // loading fica true enquanto o fetchAll inicial não resolve.
    expect(result.current.loading).toBe(true);

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const insertHandler = latestHandlerFor(channel, 'INSERT');
    await act(async () => {
      await insertHandler({ new: { id: 'incremental', status: 'aberta' } });
    });
    expect(result.current.conversations.map((c) => c.id)).toEqual(['incremental']);

    // Só agora o fetchAll inicial (mais antigo, geração obsoleta) resolve —
    // em vez de aplicar o snapshot velho (sem 'incremental') OU descartá-lo
    // (perdendo '0'/'1' pra sempre), ele refaz a busca sozinho.
    await act(async () => {
      resolveInitialFetch({ data: convRows(2), error: null });
    });

    // O retry reconciliado chega e a lista final tem TODAS as conversas —
    // não só a do evento, nem só o snapshot velho.
    await waitFor(() =>
      expect(result.current.conversations.map((c) => c.id).sort()).toEqual(['0', '1', 'incremental'].sort())
    );
  });

  it('achado do cubic (PR #1514, P1): refetch() concorrente durante fetchAll() em voo não dispara busca paralela', async () => {
    let resolveFirst!: (v: { data: unknown; error: unknown }) => void;
    const pendingFirst = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      resolveFirst = resolve;
    });
    const firstBuilder = {
      select: () => firstBuilder,
      eq: () => firstBuilder,
      order: () => firstBuilder,
      limit: () => firstBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => pendingFirst.then(onFulfilled),
    };
    // Qualquer chamada DEPOIS da 1ª reflete o estado atual — usada pelo loop
    // de reconciliação quando ele refizer a busca sozinho.
    const currentTruthBuilder = {
      select: () => currentTruthBuilder,
      eq: () => currentTruthBuilder,
      order: () => currentTruthBuilder,
      limit: () => currentTruthBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: convRows(2).map((c) => ({ ...c, id: `atual-${c.id}` })), error: null }).then(
          onFulfilled
        ),
    };
    // mockImplementationOnce (não mockImplementation): um fallback persistente
    // vazaria pros testes seguintes, já que beforeEach só faz mockClear() (que
    // não reseta a implementação, só .mock.calls/.results).
    supabaseMock.client.from
      .mockImplementationOnce(() => firstBuilder as never)
      .mockImplementationOnce(() => currentTruthBuilder as never);

    const { result } = renderHook(() => useZappConversations());
    expect(result.current.loading).toBe(true);
    const fromCallsAfterMount = supabaseMock.client.from.mock.calls.length; // 1 (fetchAll inicial, pendente)

    // Achado do cubic (P1): a versão anterior (retry recursivo direto) fazia
    // CADA chamada concorrente disparar sua própria busca em paralelo — sem
    // limite. Um refetch() manual enquanto o fetchAll inicial ainda está em
    // voo deve só sinalizar o loop já em andamento, nunca abrir uma 2ª
    // requisição imediatamente.
    await act(async () => {
      await result.current.refetch();
    });
    expect(supabaseMock.client.from.mock.calls.length).toBe(fromCallsAfterMount);

    // Só agora o fetchAll inicial (obsoleto) resolve — o loop já em andamento
    // percebe que a geração avançou e refaz a busca sozinho (1 chamada nova,
    // não mais).
    await act(async () => {
      resolveFirst({ data: convRows(2), error: null });
    });

    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual(['atual-0', 'atual-1']));
    expect(supabaseMock.client.from.mock.calls.length).toBe(fromCallsAfterMount + 1);
  });

  it('achado do cubic (PR #1514, P2): refetch() concorrente durante uma falha não perde o pedido', async () => {
    let resolveFirst!: (v: { data: unknown; error: unknown }) => void;
    const pendingFirst = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      resolveFirst = resolve;
    });
    const failingBuilder = {
      select: () => failingBuilder,
      eq: () => failingBuilder,
      order: () => failingBuilder,
      limit: () => failingBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => pendingFirst.then(onFulfilled),
    };
    const successBuilder = {
      select: () => successBuilder,
      eq: () => successBuilder,
      order: () => successBuilder,
      limit: () => successBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: convRows(2).map((c) => ({ ...c, id: `ok-${c.id}` })), error: null }).then(
          onFulfilled
        ),
    };
    // mockImplementationOnce (não mockImplementation): um fallback persistente
    // vazaria pros testes seguintes, já que beforeEach só faz mockClear().
    supabaseMock.client.from
      .mockImplementationOnce(() => failingBuilder as never)
      .mockImplementationOnce(() => successBuilder as never);

    const { result } = renderHook(() => useZappConversations());
    expect(result.current.loading).toBe(true);

    // refetch() concorrente enquanto a 1ª tentativa ainda está pendente — só
    // sinaliza (o loop já em andamento é quem vai perceber e refazer).
    await act(async () => {
      await result.current.refetch();
    });

    // A 1ª tentativa resolve com ERRO — como a geração já avançou (refetch()
    // concorrente), o loop tenta de novo em vez de propagar esse erro
    // específico e deixar o pedido concorrente sem efeito.
    await act(async () => {
      resolveFirst({ data: null, error: new Error('falha transitória') });
    });

    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual(['ok-0', 'ok-1']));
    expect(result.current.error).toBeNull();
  });

  it('achado do cubic (PR #1514, P1): esgotar as 3 tentativas numa recarga (não na 1ª carga) não sobrescreve o estado já carregado', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations.map((c) => c.id)).toEqual(['0', '1']); // 1ª carga já concluída

    const attemptA = pendingBuilder();
    const attemptB = pendingBuilder();
    const attemptC = pendingBuilder();
    supabaseMock.client.from
      .mockImplementationOnce(() => attemptA.builder as never)
      .mockImplementationOnce(() => attemptB.builder as never)
      .mockImplementationOnce(() => attemptC.builder as never);

    // Dispara o refetch (attempt 0/3, fica pendente em attemptA).
    let refetchDone: Promise<void> | undefined;
    act(() => {
      refetchDone = result.current.refetch();
    });

    // Cada refetch() concorrente enquanto uma tentativa está em voo só
    // avança a geração (achado já coberto acima) — usado aqui só pra forçar
    // as 3 tentativas a nunca alcançarem a geração atual.
    await act(async () => {
      await result.current.refetch(); // bump concorrente durante attempt 0
      attemptA.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-a' }], error: null });
    });
    await act(async () => {
      await result.current.refetch(); // bump concorrente durante attempt 1
      attemptB.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-b' }], error: null });
    });
    await act(async () => {
      await result.current.refetch(); // bump concorrente durante attempt 2 (última)
      attemptC.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-c' }], error: null });
      await refetchDone;
    });

    // As 3 tentativas nunca bateram a geração — como já tínhamos dado real
    // (1ª carga concluída), a última tentativa NÃO aplica o snapshot obsoleto
    // (que sobrescreveria/regrediria o estado). Fica como estava.
    expect(result.current.conversations.map((c) => c.id)).toEqual(['0', '1']);
  });

  it('achado do cubic (PR #1514, P1): esgotar as 3 tentativas na 1ª carga aplica o melhor resultado e agenda uma rodada extra', async () => {
    const attemptA = pendingBuilder();
    const attemptB = pendingBuilder();
    const attemptC = pendingBuilder();
    const followUpRows = convRows(2).map((c) => ({ ...c, id: `atual-${c.id}` }));
    supabaseMock.client.from
      .mockImplementationOnce(() => attemptA.builder as never)
      .mockImplementationOnce(() => attemptB.builder as never)
      .mockImplementationOnce(() => attemptC.builder as never)
      .mockImplementationOnce(() => syncBuilder(followUpRows) as never);

    const { result } = renderHook(() => useZappConversations());
    expect(result.current.loading).toBe(true); // nada carregado ainda — 1ª carga

    // Cada refetch() concorrente enquanto uma tentativa está em voo só avança
    // a geração — usado aqui pra forçar as 3 tentativas a nunca alcançarem a
    // geração atual, igual ao teste acima, mas SEM carga inicial já concluída.
    await act(async () => {
      await result.current.refetch(); // bump concorrente durante attempt 0
      attemptA.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-a' }], error: null });
    });
    await act(async () => {
      await result.current.refetch(); // bump concorrente durante attempt 1
      attemptB.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-b' }], error: null });
    });
    await act(async () => {
      await result.current.refetch(); // bump concorrente durante attempt 2 (última)
      attemptC.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-c' }], error: null });
    });

    // A última tentativa aplicou o snapshot obsoleto como fallback (melhor
    // que ficar vazio) e agendou uma rodada extra — que já deve ter rodado e
    // trazido o estado realmente atual.
    await waitFor(() =>
      expect(result.current.conversations.map((c) => c.id)).toEqual(['atual-0', 'atual-1'])
    );
  });

  it('achado do cubic (PR #1514, 2ª rodada): a ÚLTIMA tentativa falhando com refetch concorrente pendente numa RECARGA propaga o erro (não agenda rodada extra — evita loop sem fim)', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations.map((c) => c.id)).toEqual(['0', '1']); // 1ª carga já concluída

    const fromCallsBeforeRefetch = supabaseMock.client.from.mock.calls.length; // 1 (carga inicial)
    const attemptA = pendingBuilder();
    const attemptB = pendingBuilder();
    const attemptC = pendingBuilder(); // última tentativa — vai FALHAR
    // Só 3 mocks: numa RECARGA (hasLoadedOnceRef já true), a última tentativa
    // falhando NÃO agenda uma 4ª chamada — achado do cubic: sem esse teto, um
    // fluxo de eventos + falhas intermitentes sustentado podia encadear
    // follow-ups indefinidamente. Depois da 1ª carga, propaga o erro normal.
    supabaseMock.client.from
      .mockImplementationOnce(() => attemptA.builder as never)
      .mockImplementationOnce(() => attemptB.builder as never)
      .mockImplementationOnce(() => attemptC.builder as never);

    let refetchDone: Promise<void> | undefined;
    act(() => {
      refetchDone = result.current.refetch();
    });

    await act(async () => {
      await result.current.refetch(); // bump concorrente durante attempt 0
      attemptA.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-a' }], error: null });
    });
    await act(async () => {
      await result.current.refetch(); // bump concorrente durante attempt 1
      attemptB.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-b' }], error: null });
    });
    await act(async () => {
      await result.current.refetch(); // bump concorrente durante a ÚLTIMA tentativa
      attemptC.resolve({ data: null, error: new Error('falha na última tentativa') });
      await refetchDone;
    });

    // Erro propagado normalmente (não perdido em silêncio) — e sem nenhuma
    // 4ª chamada a from() (nenhum follow-up agendado).
    expect(result.current.error).toBe('falha na última tentativa');
    expect(result.current.conversations.map((c) => c.id)).toEqual(['0', '1']);
    expect(supabaseMock.client.from.mock.calls.length).toBe(fromCallsBeforeRefetch + 3);
  });

  it('achado do coderabbit (PR #1514, rodada H): catch-path na 1ª carga não trava o fallback da rodada seguinte em silêncio', async () => {
    const round1A = pendingBuilder();
    const round1B = pendingBuilder();
    const round1C = pendingBuilder(); // catch-path: última tentativa da rodada 1 também falha
    const round2A = pendingBuilder();
    const round2B = pendingBuilder();
    const round2C = pendingBuilder(); // success-path: última tentativa da rodada 2, obsoleta mas SEM erro
    const round3Rows = convRows(2).map((c) => ({ ...c, id: `atual-${c.id}` }));
    supabaseMock.client.from
      .mockImplementationOnce(() => round1A.builder as never)
      .mockImplementationOnce(() => round1B.builder as never)
      .mockImplementationOnce(() => round1C.builder as never)
      .mockImplementationOnce(() => round2A.builder as never)
      .mockImplementationOnce(() => round2B.builder as never)
      .mockImplementationOnce(() => round2C.builder as never)
      .mockImplementationOnce(() => syncBuilder(round3Rows) as never);

    const { result } = renderHook(() => useZappConversations());
    expect(result.current.loading).toBe(true); // nada carregado ainda — 1ª carga

    // Rodada 1 (carga inicial): as 3 tentativas FALHAM, cada uma com um
    // refetch() concorrente no meio — cai no caminho de ERRO na última
    // tentativa. Antes do fix, isso marcava hasLoadedOnceRef=true sem
    // nunca ter mostrado nada; agora só marca followUpAttemptedRef.
    await act(async () => {
      await result.current.refetch();
      round1A.resolve({ data: null, error: new Error('falha transitória a') });
    });
    await act(async () => {
      await result.current.refetch();
      round1B.resolve({ data: null, error: new Error('falha transitória b') });
    });
    await act(async () => {
      await result.current.refetch();
      round1C.resolve({ data: null, error: new Error('falha transitória c') });
    });

    // Rodada 2 (follow-up automático): as 3 tentativas SUCEDEM mas seguem
    // obsoletas até a última (bump concorrente antes de cada resolve).
    await act(async () => {
      await result.current.refetch();
      round2A.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-2a' }], error: null });
    });
    await act(async () => {
      await result.current.refetch();
      round2B.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-2b' }], error: null });
    });
    await act(async () => {
      await result.current.refetch();
      round2C.resolve({ data: [{ ...CONV_FIXTURE, id: 'obsoleta-2c' }], error: null });
    });

    // A última tentativa da rodada 2 devia aplicar o snapshot obsoleto como
    // fallback (achado do coderabbit: antes do fix, hasLoadedOnceRef já
    // estava true — marcado sem exibir nada no caminho de erro da rodada 1 —
    // e esse fallback nunca disparava: loading=false, conversations=[],
    // error=null pra sempre). Isso agenda uma 3ª rodada, que roda sem mais
    // bumps e traz o estado real.
    await waitFor(() =>
      expect(result.current.conversations.map((c) => c.id)).toEqual(['atual-0', 'atual-1'])
    );
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

// ─── Testes de gap P0/P1 (auditoria exaustiva — rodada final) ───────────────
describe('useZappConversations — gaps P0/P1 (cobertura de segurança)', () => {
  it('G1: setState não é chamado após unmount (mountedRef protege contra atualização de estado obsoleto)', async () => {
    const pending = pendingBuilder();
    supabaseMock.client.from.mockImplementationOnce(() => pending.builder as never);

    const { result, unmount } = renderHook(() => useZappConversations());
    expect(result.current.loading).toBe(true);

    // Desmonta antes de resolver o fetch — mountedRef deve bloquear setState
    unmount();

    // Resolver após unmount não deve lançar nem alterar estado
    await act(async () => {
      pending.resolve({ data: convRows(3), error: null });
      // Micro-tick para propagar a promise
      await new Promise((r) => setTimeout(r, 0));
    });

    // Conversations permanece vazio (estado inicial) — setState foi bloqueado
    expect(result.current.conversations).toHaveLength(0);
  });

  it('G2: removeChannel é chamado na limpeza do useEffect (cleanup sem memory leak)', async () => {
    const { unmount } = renderHook(() => useZappConversations());
    // Garante que o hook inicializou sem chamar removeChannel ainda
    await waitFor(() => expect(supabaseMock.client.removeChannel).not.toHaveBeenCalled());

    // Antes do unmount, removeChannel não deve ter sido chamado
    const callsBefore = supabaseMock.client.removeChannel.mock.calls.length;
    unmount();

    // Após unmount, removeChannel deve ter sido chamado exatamente 1 vez a mais
    expect(supabaseMock.client.removeChannel.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('G3: UPDATE com status fora do filtro atual remove a conversa (sem regressão de bail-out)', async () => {
    const { result } = renderHook(() => useZappConversations({ status: 'aberta' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toHaveLength(2);

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const updateHandler = latestHandlerFor(channel, 'UPDATE');

    await act(async () => {
      // status fora do filtro 'aberta' → deve remover
      await updateHandler({ new: { id: '0', status: 'resolvida' } });
    });

    expect(result.current.conversations.find((c) => c.id === '0')).toBeUndefined();
    expect(result.current.conversations).toHaveLength(1);
  });

  it('G4: INSERT com status fora do filtro atual não adiciona conversa (sem regressão de status guard)', async () => {
    const { result } = renderHook(() => useZappConversations({ status: 'aberta' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toHaveLength(2);

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const insertHandler = latestHandlerFor(channel, 'INSERT');

    const fromCallsBefore = supabaseMock.client.from.mock.calls.length;

    await act(async () => {
      // status fora do filtro → deve ser ignorado completamente
      await insertHandler({ new: { id: 'nova-fora-filtro', status: 'resolvida', instance_name: ZAPPWEB_INSTANCE } });
    });

    // Nenhuma conversa adicionada
    expect(result.current.conversations).toHaveLength(2);
    // Nenhum from() extra chamado (sem fetchOne disparado)
    expect(supabaseMock.client.from.mock.calls.length).toBe(fromCallsBefore);
  });

  it('G5: INSERT com fetchOne retornando null não insere conversa (guard de resultado vazio)', async () => {
    const { result } = renderHook(() => useZappConversations({ status: 'aberta' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toHaveLength(2);

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const insertHandler = latestHandlerFor(channel, 'INSERT');

    // fetchOne usa .maybeSingle() ao final — precisamos de um builder compatível
    const maybeSingleBuilder = {
      select: function() { return this; },
      eq: function() { return this; },
      order: function() { return this; },
      limit: function() { return this; },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve({ data: null, error: null }).then(onFulfilled),
    };
    supabaseMock.client.from.mockImplementationOnce(() => maybeSingleBuilder as never);

    await act(async () => {
      await insertHandler({ new: { id: 'nova-sem-fetch', status: 'aberta', instance_name: ZAPPWEB_INSTANCE } });
    });

    // Nenhuma conversa adicionada quando fetchOne não encontra o registro
    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.conversations.find((c) => c.id === 'nova-sem-fetch')).toBeUndefined();
  });

  it('G6: UPDATE com status null remove a conversa (relaxação do guard no UPDATE handler)', async () => {
    const { result } = renderHook(() => useZappConversations({ status: 'aberta' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toHaveLength(2);

    const channel = supabaseMock.client.channel.mock.results[0].value;
    const updateHandler = latestHandlerFor(channel, 'UPDATE');

    await act(async () => {
      // status: null — antes do fix era ignorado pelo guard `typeof row.status !== 'string'`
      // e a conversa ficava listada incorretamente.
      await updateHandler({ new: { id: '0', status: null } });
    });

    expect(result.current.conversations.find((c) => c.id === '0')).toBeUndefined();
    expect(result.current.conversations).toHaveLength(1);
  });
});
