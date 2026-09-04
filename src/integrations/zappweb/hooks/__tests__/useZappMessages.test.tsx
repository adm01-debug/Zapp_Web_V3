import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { createMockSupabase } from '@/test/mocks/supabase';
import { useZappMessages } from '../useZappMessages';

type MockClient = ReturnType<typeof createMockSupabase>;

// Holder populado pela factory do vi.mock (roda antes dos imports do módulo).
// `table` é passado POR REFERÊNCIA para o createMockSupabase: o mockFrom lê
// `overrides.tables[table].data/.error` em tempo de chamada, então mutar aqui
// dentro dos testes controla o erro resolvido pela query.
const supabaseMock = vi.hoisted(() => ({
  client: null as unknown as MockClient,
  table: { data: [] as unknown[], error: null as unknown },
}));

// Mock do client principal (re-exportado como zappSupabase pelo supabaseClient).
vi.mock('@/integrations/supabase/client', async () => {
  const { createMockSupabase } =
    await vi.importActual<typeof import('@/test/mocks/supabase')>('@/test/mocks/supabase');
  supabaseMock.client = createMockSupabase({
    tables: { evolution_messages_wpp2: supabaseMock.table },
  });
  return { supabase: supabaseMock.client };
});

// log é usado no catch do fetchAll — no-op para o teste focar no estado do hook.
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Envelope 422 canônico do contract-kit (docs/CONTRACT_TESTING.md).
const CONTRACT_ENVELOPE = {
  error: true,
  code: 'contract_violation',
  message: 'Payload não satisfaz o contrato evolution-messages@v1.',
  contract: 'evolution-messages@v1',
  requestId: 'req_abc123',
  details: [{ path: 'instance', message: 'instância inválida' }],
};

// Envelope de DOMÍNIO (securityErrorResponse): details é OBJETO de metadados —
// o guard DEVE retornar false (docs/CONTRACT_TESTING.md seção "Envelopes de domínio").
const DOMAIN_ENVELOPE = {
  error: true,
  code: 'MALWARE_DETECTED',
  message: 'Arquivo bloqueado pelo scanner.',
  verdict: 'malicious',
  scanId: 'scan_abc123',
  details: { verdict: 'malicious', threat: 'trojan' },
};

const REMOTE_JID = '5511999990001@s.whatsapp.net';

beforeEach(() => {
  supabaseMock.table.error = null;
  supabaseMock.client.from.mockClear();
  supabaseMock.client.channel.mockClear();
  supabaseMock.client.removeChannel.mockClear();
});

describe('useZappMessages — isContractErrorResponse no fetch de mensagens', () => {
  it('erro de contrato (envelope 422 canônico) → mensagem amigável do backend, sem String(e)', async () => {
    supabaseMock.table.error = CONTRACT_ENVELOPE;

    const { result } = renderHook(() =>
      useZappMessages({ remoteJid: REMOTE_JID })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(CONTRACT_ENVELOPE.message);
    expect(result.current.messages).toEqual([]);
  });

  it('erro genérico (Error) → fluxo inalterado (mensagem do erro)', async () => {
    supabaseMock.table.error = new Error('falha de rede na query');

    const { result } = renderHook(() =>
      useZappMessages({ remoteJid: REMOTE_JID })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('falha de rede na query');
  });

  it('envelope de domínio (details como objeto) → NÃO é contrato → comportamento legado intacto', async () => {
    supabaseMock.table.error = DOMAIN_ENVELOPE;

    const { result } = renderHook(() =>
      useZappMessages({ remoteJid: REMOTE_JID })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Mesmo resultado de antes da mudança: objeto não-Error cai no String(e).
    expect(result.current.error).toBe('[object Object]');
  });
});

// Auditoria 22D (item #6, 2026-09-02): `limit` era fixo, sem forma de
// carregar mensagens mais antigas. `loadOlder()` pagina por cursor
// (created_at da mais antiga carregada) e faz prepend.
describe('useZappMessages — loadOlder (paginação incremental, auditoria 22D #6)', () => {
  const msg = (id: string, createdAt: string) => ({
    id,
    message_id: `wamid-${id}`,
    remote_jid: REMOTE_JID,
    from_me: false,
    message_type: 'text',
    content: `conteúdo ${id}`,
    media_url: null,
    media_mimetype: null,
    media_type: null,
    caption: null,
    quoted_message_id: null,
    status: 'delivered',
    push_name: 'Alice',
    created_at: createdAt,
    deleted_at: null,
    edited_at: null,
    instance_name: 'wpp2',
    contact_id: null,
    conversation_id: null,
  });

  it('fetchAll: página cheia (== limit) marca hasMore=true; loadOlder faz prepend e ajusta hasMore', async () => {
    // Página 1 (mais recentes primeiro, como a query real): m3, m2
    supabaseMock.table.data = [msg('m3', '2026-08-04T12:00:03Z'), msg('m2', '2026-08-04T12:00:02Z')];

    const { result } = renderHook(() => useZappMessages({ remoteJid: REMOTE_JID, limit: 2 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.messages.map((m) => m.id)).toEqual(['m2', 'm3']);
    expect(result.current.hasMore).toBe(true);

    // Página 2 (mais antiga que m2): só 1 linha — sinaliza fim da paginação
    supabaseMock.table.data = [msg('m1', '2026-08-04T12:00:01Z')];
    const fromCallsBefore = supabaseMock.client.from.mock.calls.length;

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(result.current.hasMore).toBe(false);

    // Achado do cubic (PR #1514): sem esta asserção, remover o `.lt('created_at', oldest)`
    // do hook não quebrava o teste (o mock injeta a página 2 direto, sem filtrar).
    const loadOlderBuilder = supabaseMock.client.from.mock.results[fromCallsBefore].value;
    expect(loadOlderBuilder.lt).toHaveBeenCalledWith('created_at', '2026-08-04T12:00:02Z');
  });

  it('loadOlder é no-op quando hasMore já é false', async () => {
    supabaseMock.table.data = [msg('m1', '2026-08-04T12:00:01Z')]; // 1 linha < limit(2) → hasMore=false

    const { result } = renderHook(() => useZappMessages({ remoteJid: REMOTE_JID, limit: 2 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(false);

    const fromCallsBefore = supabaseMock.client.from.mock.calls.length;
    await act(async () => {
      await result.current.loadOlder();
    });

    expect(supabaseMock.client.from.mock.calls.length).toBe(fromCallsBefore);
    expect(result.current.messages).toHaveLength(1);
  });

  // Review do Copilot no PR #1514: loadOlder() em voo + troca de remoteJid
  // não pode poluir a conversa nova com o resultado (tardio) da antiga.
  it('troca de remoteJid durante loadOlder() em voo não polui a conversa nova', async () => {
    const REMOTE_JID_B = '5511999990002@s.whatsapp.net';

    supabaseMock.table.data = [msg('a2', '2026-08-04T12:00:02Z'), msg('a1', '2026-08-04T12:00:01Z')];
    const { result, rerender } = renderHook(
      ({ remoteJid }) => useZappMessages({ remoteJid, limit: 2 }),
      { initialProps: { remoteJid: REMOTE_JID as string | null } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages.map((m) => m.id)).toEqual(['a1', 'a2']);

    // Query de loadOlder da conversa A fica pendente — resolvida manualmente
    // só depois da troca de conversa, simulando a corrida.
    let resolveStaleQuery!: (v: { data: unknown; error: unknown }) => void;
    const staleQuery = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      resolveStaleQuery = resolve;
    });
    const controllableBuilder = {
      select: () => controllableBuilder,
      eq: () => controllableBuilder,
      is: () => controllableBuilder,
      lt: () => controllableBuilder,
      order: () => controllableBuilder,
      limit: () => controllableBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        staleQuery.then(onFulfilled),
    };
    supabaseMock.client.from.mockImplementationOnce(() => controllableBuilder as never);

    let loadOlderDone: Promise<void> | undefined;
    act(() => {
      loadOlderDone = result.current.loadOlder();
    });

    // Troca pra conversa B ANTES da query de A resolver.
    supabaseMock.table.data = [msg('b1', '2026-08-04T13:00:01Z')];
    rerender({ remoteJid: REMOTE_JID_B });
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['b1']));

    // Só agora a query tardia de A resolve.
    await act(async () => {
      resolveStaleQuery({ data: [msg('a0', '2026-08-04T11:00:00Z')], error: null });
      await loadOlderDone;
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(['b1']);
    // loadingMore não pode ficar travado em true (senão loadOlder da conversa
    // B vira no-op permanente pelo guard `loadingMore` no topo da função).
    expect(result.current.loadingMore).toBe(false);
  });

  // Achado do cubic (PR #1514): o guard original só comparava remoteJid — uma
  // troca de instance (mesma conversa, outra instância) durante loadOlder()
  // em voo também não pode poluir o estado.
  it('troca de instance durante loadOlder() em voo não polui a conversa atual', async () => {
    supabaseMock.table.data = [msg('a2', '2026-08-04T12:00:02Z'), msg('a1', '2026-08-04T12:00:01Z')];
    const { result, rerender } = renderHook(
      ({ instance }) => useZappMessages({ remoteJid: REMOTE_JID, instance, limit: 2 }),
      { initialProps: { instance: 'wpp2' } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages.map((m) => m.id)).toEqual(['a1', 'a2']);

    let resolveStaleQuery!: (v: { data: unknown; error: unknown }) => void;
    const staleQuery = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      resolveStaleQuery = resolve;
    });
    const controllableBuilder = {
      select: () => controllableBuilder,
      eq: () => controllableBuilder,
      is: () => controllableBuilder,
      lt: () => controllableBuilder,
      order: () => controllableBuilder,
      limit: () => controllableBuilder,
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        staleQuery.then(onFulfilled),
    };
    supabaseMock.client.from.mockImplementationOnce(() => controllableBuilder as never);

    let loadOlderDone: Promise<void> | undefined;
    act(() => {
      loadOlderDone = result.current.loadOlder();
    });

    // Troca de instance ANTES da query antiga resolver.
    supabaseMock.table.data = [msg('c1', '2026-08-04T13:00:01Z')];
    rerender({ instance: 'comercial_01' });
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['c1']));

    await act(async () => {
      resolveStaleQuery({ data: [msg('a0', '2026-08-04T11:00:00Z')], error: null });
      await loadOlderDone;
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(['c1']);
    expect(result.current.loadingMore).toBe(false);
  });
});
