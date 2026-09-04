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

beforeEach(() => {
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
    const events = channel.on.mock.calls
      .slice(-3)
      .map((c: unknown[]) => (c[1] as { event: string }).event);
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
  });
});
