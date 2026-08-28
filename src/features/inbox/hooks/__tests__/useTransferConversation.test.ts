import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransferConversation } from '../useTransferConversation';

const mockGetUser = vi.hoisted(() => vi.fn());
const mockContactsMaybeSingle = vi.hoisted(() => vi.fn());
const mockContactsEq = vi.hoisted(() => vi.fn(() => ({ maybeSingle: mockContactsMaybeSingle })));
const mockContactsSelect = vi.hoisted(() => vi.fn(() => ({ eq: mockContactsEq })));
const mockContactsUpdateMaybeSingle = vi.hoisted(() => vi.fn());
const mockContactsUpdateSelect = vi.hoisted(() =>
  vi.fn(() => ({ maybeSingle: mockContactsUpdateMaybeSingle }))
);
const mockContactsUpdateEq = vi.hoisted(() => vi.fn(() => ({ select: mockContactsUpdateSelect })));
const mockContactsUpdate = vi.hoisted(() => vi.fn(() => ({ eq: mockContactsUpdateEq })));
const mockMessagesInsert = vi.hoisted(() => vi.fn());
const mockTransfersMaybeSingle = vi.hoisted(() => vi.fn());
const mockTransfersSelect = vi.hoisted(() =>
  vi.fn(() => ({ maybeSingle: mockTransfersMaybeSingle }))
);
const mockTransfersInsert = vi.hoisted(() => vi.fn(() => ({ select: mockTransfersSelect })));
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
        update: mockContactsUpdate,
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
const AGENT_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('useTransferConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: AGENT_ID } }, error: null });
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
    mockContactsUpdateMaybeSingle.mockResolvedValue({ data: { id: CONTACT_ID }, error: null });
    mockMessagesInsert.mockResolvedValue({ error: null });
    mockTransfersMaybeSingle.mockResolvedValue({ data: { id: 'tr-1' }, error: null });
    mockTransferCommentsInsert.mockResolvedValue({ error: null });
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

    expect(mockContactsUpdate).toHaveBeenCalledWith({ assigned_to: 'agent-destino' });
    expect(mockMessagesInsert).toHaveBeenCalled();
    expect(mockTransfersInsert).toHaveBeenCalled();
    expect(mockTransfersInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        from_queue_id: 'queue-antiga',
        transfer_type: 'internal',
        to_agent_id: 'agent-destino',
      })
    );
    expect(mockTransferCommentsInsert).toHaveBeenCalled();
    expect(outcome).toEqual({
      status: 'success',
      title: 'Chat transferido!',
      description: 'O chat foi transferido para outro atendente.',
    });
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

    expect(mockContactsUpdate).toHaveBeenCalledWith({
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

  it('retorna error quando a atualização principal falha e não grava falso sucesso', async () => {
    mockContactsUpdateMaybeSingle.mockResolvedValue({
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
    mockContactsUpdateMaybeSingle.mockResolvedValue({ data: null, error: null });

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
