import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, priorityMock, channelMock, removeChannelMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  priorityMock: vi.fn((_signal: AbortSignal, fn: () => Promise<unknown>) => fn()),
  channelMock: vi.fn(() => {
    const channel = {
      on: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    return channel;
  }),
  removeChannelMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    channel: channelMock,
    removeChannel: removeChannelMock,
  },
  withSupabaseHighPrioritySignal: priorityMock,
}));

vi.mock('@/integrations/supabase/channelErrorLogging', () => ({
  logChannelError: vi.fn(),
}));

import { useMessagesCursor } from './useMessagesCursor';

interface DeferredPage {
  promise: Promise<{ data: unknown[]; error: null }>;
  resolve: (value: { data: unknown[]; error: null }) => void;
}

function deferredPage(): DeferredPage {
  let resolve!: DeferredPage['resolve'];
  const promise = new Promise<{ data: unknown[]; error: null }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function row(id: string, createdAt: string) {
  return { id, created_at: createdAt };
}

beforeEach(() => {
  rpcMock.mockReset();
  priorityMock.mockClear();
  channelMock.mockClear();
  removeChannelMock.mockClear();
});

describe('useMessagesCursor — prioridade e troca rapida de contato', () => {
  it('carrega a primeira pagina com prioridade associada ao AbortSignal', async () => {
    rpcMock.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({
        data: [row('msg-a', '2026-08-31T10:00:00.000Z')],
        error: null,
      }),
    });

    const { result } = renderHook(() =>
      useMessagesCursor({ remoteJid: 'contact-a@s.whatsapp.net' })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(priorityMock).toHaveBeenCalledTimes(1);
    expect(priorityMock.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
    expect(result.current.messages.map((message) => message.id)).toEqual(['msg-a']);
  });

  it('A → B → C descarta respostas obsoletas e conserva apenas a pagina de C', async () => {
    const requests = new Map<string, DeferredPage>();
    rpcMock.mockImplementation((_fn: string, args: { p_remote_jid: string }) => {
      const request = deferredPage();
      requests.set(args.p_remote_jid, request);
      return { abortSignal: vi.fn(() => request.promise) };
    });

    const { result, rerender } = renderHook(
      ({ remoteJid }: { remoteJid: string }) => useMessagesCursor({ remoteJid }),
      { initialProps: { remoteJid: 'contact-a@s.whatsapp.net' } }
    );
    await waitFor(() => expect(requests.has('contact-a@s.whatsapp.net')).toBe(true));

    rerender({ remoteJid: 'contact-b@s.whatsapp.net' });
    await waitFor(() => expect(requests.has('contact-b@s.whatsapp.net')).toBe(true));

    rerender({ remoteJid: 'contact-c@s.whatsapp.net' });
    await waitFor(() => expect(requests.has('contact-c@s.whatsapp.net')).toBe(true));

    await act(async () => {
      requests.get('contact-c@s.whatsapp.net')!.resolve({
        data: [row('msg-c', '2026-08-31T10:00:02.000Z')],
        error: null,
      });
    });
    await waitFor(() =>
      expect(result.current.messages.map((message) => message.id)).toEqual(['msg-c'])
    );

    await act(async () => {
      requests.get('contact-a@s.whatsapp.net')!.resolve({
        data: [row('msg-a', '2026-08-31T10:00:00.000Z')],
        error: null,
      });
      requests.get('contact-b@s.whatsapp.net')!.resolve({
        data: [row('msg-b', '2026-08-31T10:00:01.000Z')],
        error: null,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages.map((message) => message.id)).toEqual(['msg-c']);
    expect(result.current.error).toBeNull();
  });
});
