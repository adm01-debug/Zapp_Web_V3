import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransferConversation } from '../useTransferConversation';

const mockGetUser = vi.hoisted(() => vi.fn());
const mockProfilesMaybeSingle = vi.hoisted(() => vi.fn());
const mockProfilesEq = vi.hoisted(() => vi.fn(() => ({ maybeSingle: mockProfilesMaybeSingle })));
const mockProfilesSelect = vi.hoisted(() => vi.fn(() => ({ eq: mockProfilesEq })));
const mockContactsMaybeSingle = vi.hoisted(() => vi.fn());
const mockContactsEq = vi.hoisted(() => vi.fn(() => ({ maybeSingle: mockContactsMaybeSingle })));
const mockContactsSelect = vi.hoisted(() => vi.fn(() => ({ eq: mockContactsEq })));
const contactUpdateMocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const select = vi.fn(() => ({ maybeSingle }));
  type UpdateBuilder = {
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    select: typeof select;
  };
  const builder = {} as UpdateBuilder;
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.select = select;
  const update = vi.fn(() => builder);
  return { builder, maybeSingle, select, update };
});
const mockMessagesInsert = vi.hoisted(() => vi.fn());
const mockTransfersMaybeSingle = vi.hoisted(() => vi.fn());
const mockTransfersSelect = vi.hoisted(() =>
  vi.fn(() => ({ maybeSingle: mockTransfersMaybeSingle }))
);
const mockTransfersInsert = vi.hoisted(() =>
  vi.fn((_payload: Record<string, unknown>) => ({ select: mockTransfersSelect }))
);
const mockTransferCommentsInsert = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: (table: string) => {
    if (table === 'contacts') {
      return {
        select: mockContactsSelect,
        update: contactUpdateMocks.update,
      };
    }
    if (table === 'profiles') {
      return {
        select: mockProfilesSelect,
      };
    }
    if (table === 'messages') {
      return {
        insert: mockMessagesInsert,
      };
    }
    throw new Error(`dbFrom inesperado no teste: ${table}`);
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
    from: (table: string) => {
      if (table === 'conversation_transfers') {
        return {
          insert: mockTransfersInsert,
        };
      }
      if (table === 'transfer_comments') {
        return {
          insert: mockTransferCommentsInsert,
        };
      }
      throw new Error(`supabase.from inesperado no teste: ${table}`);
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => mockLogger,
}));

const CONTACT_ID = '550e8400-e29b-41d4-a716-446655440000';
const AUTH_USER_ID = '660e8400-e29b-41d4-a716-446655440000';
const PROFILE_ID = '770e8400-e29b-41d4-a716-446655440000';

describe('useTransferConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null });
    mockProfilesMaybeSingle.mockResolvedValue({
      data: { id: PROFILE_ID, name: 'Agente Teste' },
      error: null,
    });
    mockContactsMaybeSingle.mockResolvedValue({
      data: {
        assigned_to: 'agent-anterior',
        queue_id: 'queue-antiga',
        name: 'Cliente Teste',
        remote_jid: '5511999999999@s.whatsapp.net',
        instance_name: 'wpp1',
      },
      error: null,
    });
    contactUpdateMocks.maybeSingle.mockResolvedValue({ data: { id: CONTACT_ID }, error: null });
    mockMessagesInsert.mockResolvedValue({ error: null });
    mockTransfersMaybeSingle.mockResolvedValue({ data: { id: 'tr-1' }, error: null });
    mockTransferCommentsInsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retorna success quando atualização principal e trilha de auditoria persistem', async () => {
    const { result } = renderHook(() =>
      useTransferConversation({
        contactId: CONTACT_ID,
        whatsappConnectionId: 'wa-1',
      })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation(
        'agent',
        'agent-destino',
        'Assumir o caso'
      );
    });

    expect(contactUpdateMocks.update).toHaveBeenCalledWith({ assigned_to: 'agent-destino' });
    expect(contactUpdateMocks.builder.eq).toHaveBeenCalledWith('assigned_to', 'agent-anterior');
    expect(contactUpdateMocks.builder.eq).toHaveBeenCalledWith('queue_id', 'queue-antiga');
    expect(mockMessagesInsert).toHaveBeenCalled();
    expect(mockMessagesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: PROFILE_ID })
    );
    expect(mockTransfersInsert).toHaveBeenCalled();
    expect(mockTransfersInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        from_queue_id: 'queue-antiga',
        transfer_type: 'internal',
        priority: 2,
        to_agent_id: 'agent-destino',
      })
    );
    expect(mockTransferCommentsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: PROFILE_ID, author_name: 'Agente Teste' })
    );
    expect(outcome).toEqual({
      status: 'success',
      title: 'Chat transferido!',
      description: 'O chat foi transferido para outro atendente.',
    });
  });

  it('usa filtros null-safe no compare-and-set da atribuição atual', async () => {
    mockContactsMaybeSingle.mockResolvedValue({
      data: {
        assigned_to: null,
        queue_id: null,
        name: 'Cliente sem fila',
        remote_jid: '5511999999999@s.whatsapp.net',
        instance_name: 'wpp1',
      },
      error: null,
    });

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    await act(async () => {
      await result.current.transferConversation('agent', 'agent-destino');
    });

    expect(contactUpdateMocks.builder.is).toHaveBeenCalledWith('assigned_to', null);
    expect(contactUpdateMocks.builder.is).toHaveBeenCalledWith('queue_id', null);
  });

  it('gera tickets distintos para transferências concorrentes no mesmo milissegundo', async () => {
    const fixedNow = 1_787_950_800_000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    vi.stubGlobal('crypto', { randomUUID });

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    await act(async () => {
      await Promise.all([
        result.current.transferConversation('agent', 'agent-destino'),
        result.current.transferConversation('queue', 'queue-destino'),
      ]);
    });

    const ticketNumbers = mockTransfersInsert.mock.calls.map(
      ([payload]) => payload.ticket_number as string
    );

    expect(ticketNumbers).toHaveLength(2);
    expect(new Set(ticketNumbers).size).toBe(2);
    expect(ticketNumbers).toEqual(
      expect.arrayContaining([
        `T-${fixedNow.toString(36).toUpperCase()}-1111111111114111`,
        `T-${fixedNow.toString(36).toUpperCase()}-2222222222224222`,
      ])
    );
    expect(ticketNumbers.every((ticket) => /^T-[0-9A-Z]+-[0-9A-F]{16}$/.test(ticket))).toBe(true);
  });

  it('usa getRandomValues quando crypto.randomUUID não está disponível', async () => {
    const fixedNow = 1_787_950_800_000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const entropyChunks = [
      [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07],
      [0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f],
    ];
    const getRandomValues = vi.fn((target: Uint8Array) => {
      target.set(entropyChunks[getRandomValues.mock.calls.length - 1]);
      return target;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    await act(async () => {
      await result.current.transferConversation('agent', 'agent-destino');
      await result.current.transferConversation('queue', 'queue-destino');
    });

    const ticketNumbers = mockTransfersInsert.mock.calls.map(
      ([payload]) => payload.ticket_number as string
    );

    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(ticketNumbers).toEqual([
      `T-${fixedNow.toString(36).toUpperCase()}-0001020304050607`,
      `T-${fixedNow.toString(36).toUpperCase()}-08090A0B0C0D0E0F`,
    ]);
    expect(new Set(ticketNumbers).size).toBe(2);
  });

  it('mantém unicidade local no fallback legado sem Web Crypto', async () => {
    const fixedNow = 1_787_950_800_000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    vi.stubGlobal('crypto', undefined);

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    await act(async () => {
      await result.current.transferConversation('agent', 'agent-destino');
      await result.current.transferConversation('queue', 'queue-destino');
    });

    const ticketNumbers = mockTransfersInsert.mock.calls.map(
      ([payload]) => payload.ticket_number as string
    );

    expect(ticketNumbers).toHaveLength(2);
    expect(new Set(ticketNumbers).size).toBe(2);
    expect(ticketNumbers.every((ticket) => /^T-[0-9A-Z]+-[0-9A-F]{16}$/.test(ticket))).toBe(true);
  });

  it('retorna partial quando a auditoria estruturada falha depois da transferência principal', async () => {
    mockTransfersMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    const { result } = renderHook(() =>
      useTransferConversation({
        contactId: CONTACT_ID,
        whatsappConnectionId: 'wa-1',
      })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation(
        'queue',
        'queue-destino',
        'Fila especializada'
      );
    });

    expect(contactUpdateMocks.update).toHaveBeenCalledWith({
      queue_id: 'queue-destino',
      assigned_to: null,
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      'conversation_transfers insert failed:',
      expect.objectContaining({ message: expect.stringContaining('row-level security') })
    );
    expect(outcome).toEqual({
      status: 'partial',
      title: 'Transferência parcial',
      description:
        'O chat foi transferido, mas a trilha de auditoria ficou incompleta. Revise o histórico antes de seguir.',
    });
  });

  it('retorna partial quando a timeline falha depois da atualização principal', async () => {
    mockMessagesInsert.mockResolvedValue({ error: { message: 'timeline unavailable' } });

    const { result } = renderHook(() =>
      useTransferConversation({
        contactId: CONTACT_ID,
        whatsappConnectionId: 'wa-1',
      })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation('agent', 'agent-destino');
    });

    expect(mockTransfersInsert).toHaveBeenCalled();
    expect(outcome?.status).toBe('partial');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'messages insert failed during transfer audit trail:',
      expect.objectContaining({ message: 'timeline unavailable' })
    );
  });

  it('retorna partial quando a promise da timeline rejeita após a atribuição', async () => {
    mockMessagesInsert.mockRejectedValue(new Error('network retry exhausted'));

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation('agent', 'agent-destino');
    });

    expect(outcome?.status).toBe('partial');
    expect(mockTransfersInsert).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'messages insert failed during transfer audit trail:',
      expect.any(Error)
    );
  });

  it('retorna partial quando a promise da auditoria rejeita após a atribuição', async () => {
    mockTransfersMaybeSingle.mockRejectedValue(new Error('audit endpoint unavailable'));

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation('queue', 'queue-destino');
    });

    expect(outcome?.status).toBe('partial');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'conversation_transfers insert failed:',
      expect.any(Error)
    );
  });

  it('retorna partial quando o insert de auditoria não devolve id', async () => {
    mockTransfersMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() =>
      useTransferConversation({
        contactId: CONTACT_ID,
        whatsappConnectionId: 'wa-1',
      })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation('agent', 'agent-destino');
    });

    expect(outcome?.status).toBe('partial');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'conversation_transfers insert returned no audit id'
    );
  });

  it('interrompe como error quando a leitura inicial do contato falha', async () => {
    mockContactsMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'contact visibility denied' },
    });

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation('agent', 'agent-destino');
    });

    expect(outcome?.status).toBe('error');
    expect(contactUpdateMocks.update).not.toHaveBeenCalled();
    expect(mockMessagesInsert).not.toHaveBeenCalled();
    expect(mockTransfersInsert).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Transfer preflight failed:',
      expect.objectContaining({ message: 'contact visibility denied' })
    );
  });

  it('interrompe antes do contato quando o perfil surrogate do agente não é resolvido', async () => {
    mockProfilesMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'profile visibility denied' },
    });

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation('agent', 'agent-destino');
    });

    expect(outcome?.status).toBe('error');
    expect(mockProfilesEq).toHaveBeenCalledWith('user_id', AUTH_USER_ID);
    expect(mockContactsSelect).not.toHaveBeenCalled();
    expect(contactUpdateMocks.update).not.toHaveBeenCalled();
    expect(mockMessagesInsert).not.toHaveBeenCalled();
    expect(mockTransfersInsert).not.toHaveBeenCalled();
  });

  it('retorna error quando a atualização principal falha e não grava falso sucesso', async () => {
    contactUpdateMocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });

    const { result } = renderHook(() =>
      useTransferConversation({
        contactId: CONTACT_ID,
        whatsappConnectionId: 'wa-1',
      })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation('agent', 'agent-destino');
    });

    expect(mockMessagesInsert).not.toHaveBeenCalled();
    expect(mockTransfersInsert).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: 'error',
      title: 'Erro na transferência',
      description: 'Não foi possível transferir o chat. Tente novamente.',
    });
  });

  it('retorna error quando o update afeta zero linhas e não continua a trilha', async () => {
    contactUpdateMocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() =>
      useTransferConversation({ contactId: CONTACT_ID, whatsappConnectionId: 'wa-1' })
    );

    let outcome: Awaited<ReturnType<typeof result.current.transferConversation>> | undefined;
    await act(async () => {
      outcome = await result.current.transferConversation('agent', 'agent-destino');
    });

    expect(outcome?.status).toBe('error');
    expect(mockMessagesInsert).not.toHaveBeenCalled();
    expect(mockTransfersInsert).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Transfer contact update failed:',
      expect.objectContaining({ message: 'Contact update affected zero rows' })
    );
  });
});
