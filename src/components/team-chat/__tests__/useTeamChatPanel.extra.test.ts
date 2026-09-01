import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTeamChatPanel } from '../useTeamChatPanel';
import type { TeamConversation, TeamMessage } from '@/hooks/useTeamChat';
import { useTeamMessages, useDeleteTeamMessage } from '@/hooks/useTeamChat';

// ---------------------------------------------------------------------------
// Estado de mock mutável entre testes
// ---------------------------------------------------------------------------

let mockMessages: TeamMessage[] = [];
let mockIsFetchingNextPage = false;
const sonnerCalls: Array<[string, ...unknown[]]> = [];

// ---------------------------------------------------------------------------
// Factories de mock — refletem o tipo REAL de retorno dos hooks
// ---------------------------------------------------------------------------

/** Retorno real de `useTeamMessages` (inclui isError, error e lastReadRef). */
type TeamMessagesResult = ReturnType<typeof useTeamMessages>;

/** Retorno real de `useDeleteTeamMessage` (UseMutationResult completo do TanStack Query). */
type DeleteTeamMessageResult = ReturnType<typeof useDeleteTeamMessage>;

/** Campos que os testes sobrescrevem — o restante recebe defaults sensatos. */
interface TeamMessagesOverrides {
  messages?: TeamMessage[];
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isError?: boolean;
  error?: TeamMessagesResult['error'];
}

function mockTeamMessages(overrides: TeamMessagesOverrides = {}): TeamMessagesResult {
  return {
    messages: [],
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn<TeamMessagesResult['fetchNextPage']>(),
    hasNextPage: false,
    isFetchingNextPage: false,
    lastReadRef: { current: null },
    ...overrides,
  };
}

/**
 * Monta um `UseMutationResult` completo no estado idle.
 * Só `mutate` varia entre os cenários testados.
 */
function mockDeleteTeamMessage(
  mutate: DeleteTeamMessageResult['mutate'] = vi.fn<DeleteTeamMessageResult['mutate']>()
): DeleteTeamMessageResult {
  return {
    mutate,
    mutateAsync: vi.fn<DeleteTeamMessageResult['mutateAsync']>(),
    reset: vi.fn<DeleteTeamMessageResult['reset']>(),
    data: undefined,
    error: null,
    variables: undefined,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: true,
    isPending: false,
    isPaused: false,
    isSuccess: false,
    status: 'idle',
    submittedAt: 0,
  };
}

// ---------------------------------------------------------------------------
// Mocks de módulos
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', name: 'Test User' } }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => sonnerCalls.push(['error', ...args] as [string, ...unknown[]]),
    success: (...args: unknown[]) =>
      sonnerCalls.push(['success', ...args] as [string, ...unknown[]]),
  },
}));

vi.mock('@/hooks/useTeamChat', () => ({
  useTeamMessages: vi.fn(() => ({
    messages: mockMessages,
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: mockIsFetchingNextPage,
  })),
  useSendTeamMessage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteTeamMessage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useEditTeamMessage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useToggleMuteConversation: vi.fn(() => ({ mutate: vi.fn() })),
  useUpdateTeamMessageStatus: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('@/hooks/useTextToSpeech', () => ({
  useTextToSpeech: vi.fn(() => ({ speak: vi.fn(), stop: vi.fn(), isPlaying: false })),
}));

vi.mock('@/hooks/useUserSettings', () => ({
  useUserSettings: vi.fn(() => ({
    settings: { tts_voice_id: null, tts_speed: 1 },
    updateSettings: vi.fn(),
    saveSettings: vi.fn(),
  })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { path: 'test' }, error: null })),
      })),
    },
  },
}));

vi.mock('@/lib/storageSignedUrls', () => ({
  getSignedMediaUrl: vi.fn(async () => 'https://signed.url/test'),
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebouncedValue: vi.fn((val: unknown) => val),
}));

vi.mock('@/hooks/usePerformanceMonitoring', () => ({
  usePerformanceMetrics: vi.fn(),
}));

vi.mock('@/services/api/queryKeys', () => ({
  queryKeys: {
    teamChat: {
      messages: (id: string, q: string) => ['team-chat', 'messages', id, q],
    },
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockConversation: TeamConversation = {
  id: 'conv-1',
  type: 'group',
  name: 'Canal de Teste',
  avatar_url: null,
  created_by: 'user-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  members: [
    {
      id: 'm-1',
      conversation_id: 'conv-1',
      profile_id: 'user-1',
      joined_at: '2024-01-01T00:00:00Z',
      last_read_at: null,
      is_muted: false,
    },
  ],
};

function makeMessage(id: string, content: string): TeamMessage {
  return {
    id,
    conversation_id: 'conv-1',
    sender_id: 'user-2',
    content,
    message_type: 'text',
    media_url: null,
    media_type: null,
    media_bucket: null,
    media_path: null,
    reply_to_id: null,
    is_edited: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockMessages = [];
  mockIsFetchingNextPage = false;
  sonnerCalls.length = 0;

  vi.mocked(useTeamMessages).mockImplementation(() =>
    mockTeamMessages({ messages: mockMessages, isFetchingNextPage: mockIsFetchingNextPage })
  );

  vi.mocked(useDeleteTeamMessage).mockImplementation(() => mockDeleteTeamMessage());
});

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('useTeamChatPanel — casos extras (P09)', () => {
  it('1. editingId → null após handleCancelEdit()', () => {
    const { result } = renderHook(() => useTeamChatPanel(mockConversation), {
      wrapper: createWrapper(),
    });

    const msg = makeMessage('msg-1', 'Olá');

    act(() => {
      result.current.handleStartEdit(msg);
    });
    expect(result.current.editingId).toBe('msg-1');

    act(() => {
      result.current.handleCancelEdit();
    });
    expect(result.current.editingId).toBeNull();
  });

  it('2. replyTo limpo após envio bem-sucedido', () => {
    const { result } = renderHook(() => useTeamChatPanel(mockConversation), {
      wrapper: createWrapper(),
    });

    const replyMsg = makeMessage('msg-reply', 'Mensagem original');

    act(() => {
      result.current.setReplyTo(replyMsg);
      result.current.setText('Minha resposta');
    });
    expect(result.current.replyTo).not.toBeNull();

    act(() => {
      result.current.handleSend();
    });
    expect(result.current.replyTo).toBeNull();
  });

  it('3. filteredMessages respeita searchQuery case-insensitive', () => {
    const allMsgs = [
      makeMessage('1', 'Olá mundo'),
      makeMessage('2', 'Hello World'),
      makeMessage('3', 'OLHA AQUI'),
    ];

    vi.mocked(useTeamMessages).mockImplementation((_convId, query) => {
      const q = String(query ?? '').toLowerCase();
      const filtered = q ? allMsgs.filter((m) => m.content.toLowerCase().includes(q)) : allMsgs;
      return mockTeamMessages({ messages: filtered });
    });

    const { result } = renderHook(() => useTeamChatPanel(mockConversation), {
      wrapper: createWrapper(),
    });

    expect(result.current.filteredMessages).toHaveLength(3);

    act(() => {
      result.current.setSearchQuery('ol');
    });

    // 'ol' bate em 'Olá' e 'OLHA' (case-insensitive), mas não em 'Hello'
    expect(result.current.filteredMessages).toHaveLength(2);
    expect(result.current.filteredMessages.map((m) => m.id)).toEqual(['1', '3']);
  });

  it('4. showSearch alterna com setShowSearch()', () => {
    const { result } = renderHook(() => useTeamChatPanel(mockConversation), {
      wrapper: createWrapper(),
    });

    expect(result.current.showSearch).toBe(false);

    act(() => {
      result.current.setShowSearch(true);
    });
    expect(result.current.showSearch).toBe(true);

    act(() => {
      result.current.setShowSearch(false);
    });
    expect(result.current.showSearch).toBe(false);
  });

  it('5. isFetchingNextPage false após resolução', () => {
    vi.mocked(useTeamMessages).mockImplementation(() =>
      mockTeamMessages({ isFetchingNextPage: true })
    );

    const { result, rerender } = renderHook(() => useTeamChatPanel(mockConversation), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetchingNextPage).toBe(true);

    vi.mocked(useTeamMessages).mockImplementation(() =>
      mockTeamMessages({ isFetchingNextPage: false })
    );

    rerender();

    expect(result.current.isFetchingNextPage).toBe(false);
  });

  it('6. handleDelete emite toast de erro; sem toast extra em sucesso', () => {
    // Cenário de erro: mutate invoca onError → toast.error
    const failingMutate = vi.fn<DeleteTeamMessageResult['mutate']>((variables, options) => {
      options?.onError?.(new Error('falha de rede'), variables, undefined, {
        client: new QueryClient(),
        meta: undefined,
      });
    });
    vi.mocked(useDeleteTeamMessage).mockImplementationOnce(() =>
      mockDeleteTeamMessage(failingMutate)
    );

    const { result } = renderHook(() => useTeamChatPanel(mockConversation), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.handleDelete('msg-x');
    });

    expect(sonnerCalls).toContainEqual(['error', 'Falha ao excluir.']);

    // Cenário de sucesso: mutate sem erro → nenhum toast.error adicional
    const errorCountBefore = sonnerCalls.filter((c) => c[0] === 'error').length;

    vi.mocked(useDeleteTeamMessage).mockImplementationOnce(() => mockDeleteTeamMessage());

    const { result: result2 } = renderHook(() => useTeamChatPanel(mockConversation), {
      wrapper: createWrapper(),
    });

    act(() => {
      result2.current.handleDelete('msg-y');
    });

    expect(sonnerCalls.filter((c) => c[0] === 'error').length).toBe(errorCountBefore);
  });
});
