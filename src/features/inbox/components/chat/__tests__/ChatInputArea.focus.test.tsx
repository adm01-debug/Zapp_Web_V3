/**
 * P25 — Testes de gestão de foco no ChatInputArea
 * Cobre: editingMessage ativa foco, volta null devolve foco, showSearch fechado devolve foco.
 *
 * Nota: Happy-DOM (o jsdom do vitest) simula .focus() mas document.activeElement
 * só reflete o foco real se o elemento for focusável e estiver no DOM.
 * Por isso verificamos chamadas ao método .focus() em vez de document.activeElement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { Message } from '@/types/chat';

vi.mock('framer-motion', () => {
  const passthrough = (props: { children?: unknown }) => props?.children ?? null;
  return {
    motion: new Proxy({}, { get: () => passthrough }),
    AnimatePresence: (props: { children?: unknown }) => props?.children ?? null,
    useReducedMotion: () => false,
  };
});
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: (p: { children?: unknown }) => p?.children ?? null,
  TooltipTrigger: (p: { children?: unknown }) => p?.children ?? null,
  TooltipContent: () => null,
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: (p: { children?: unknown }) => p?.children ?? null,
  PopoverTrigger: (p: { children?: unknown }) => p?.children ?? null,
  PopoverContent: () => null,
}));
vi.mock('@/lib/featureFlags', () => ({ isFeatureEnabled: () => false }));
vi.mock('@/utils/whatsappFileTypes', () => ({ formatFileSize: () => '1 KB' }));
vi.mock('@/utils/notificationSounds', () => ({ playNotificationSound: vi.fn() }));
vi.mock('../RichTextToolbar', () => ({ RichTextToolbar: () => null, RichTextToggle: () => null }));
vi.mock('../AIRewriteButton', () => ({ AIRewriteButton: () => null }));
vi.mock('../MentionAutocomplete', () => ({
  MentionAutocomplete: () => null,
  useMentions: () => ({
    isOpen: false,
    cursorPos: 0,
    checkForMention: vi.fn(),
    handleSelect: vi.fn(),
    close: vi.fn(),
  }),
}));
vi.mock('../MarkdownPreview', () => ({ MarkdownPreview: () => null }));
vi.mock('../ChatInputQueueDisplay', () => ({ ChatInputQueueDisplay: () => null }));
vi.mock('../ChatQueueProgress', () => ({ ChatQueueProgress: () => null }));
vi.mock('../ChatAttachmentPreview', () => ({ ChatAttachmentPreview: () => null }));
vi.mock('../ChatToolbar', () => ({ ChatToolbar: () => null }));
vi.mock('../ChatSendButtons', () => ({ ChatSendButtons: () => null }));

// ChatTextarea renderiza o textarea real para que possamos checar o foco
vi.mock('../ChatTextarea', () => ({
  ChatTextarea: ({ inputRef }: { inputRef?: React.RefObject<HTMLTextAreaElement | null> }) => (
    <textarea
      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
      data-testid="chat-textarea"
      aria-label="Digite sua mensagem"
    />
  ),
}));

import { ChatInputArea } from '../ChatInputArea';

const makeMsg = (id: string): Message =>
  ({ id, content: 'hello', sender: 'agent', timestamp: new Date().toISOString() } as Message);

const baseProps = {
  conversationId: 'conv-1',
  messages: [makeMsg('m1')],
  isSending: false,
  inputValue: '',
  onInputChange: vi.fn(),
  onSend: vi.fn(),
  onReply: vi.fn(),
};

describe('ChatInputArea — focus management (P25)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('editingMessage setado → foco vai para o textarea', async () => {
    let rerender: (ui: React.ReactElement) => void;
    let container: HTMLElement;

    await act(async () => {
      const result = render(<ChatInputArea {...baseProps} editingMessage={null} />);
      rerender = result.rerender;
      container = result.container;
    });

    const textarea = container!.querySelector('textarea');
    expect(textarea).toBeTruthy();

    const focusSpy = vi.spyOn(textarea!, 'focus');

    await act(async () => {
      rerender!(<ChatInputArea {...baseProps} editingMessage={makeMsg('m1')} />);
    });

    // O ChatInputArea chama inputRef.current?.focus() quando editingMessage muda
    expect(focusSpy).toHaveBeenCalled();
  });

  it('editingMessage volta a null → foco retorna ao textarea', async () => {
    let rerender: (ui: React.ReactElement) => void;
    let container: HTMLElement;

    await act(async () => {
      const result = render(<ChatInputArea {...baseProps} editingMessage={makeMsg('m1')} />);
      rerender = result.rerender;
      container = result.container;
    });

    const textarea = container!.querySelector('textarea');
    expect(textarea).toBeTruthy();

    const focusSpy = vi.spyOn(textarea!, 'focus');

    await act(async () => {
      rerender!(<ChatInputArea {...baseProps} editingMessage={null} />);
    });

    expect(focusSpy).toHaveBeenCalled();
  });

  it('showSearch fechado → foco retorna ao textarea', async () => {
    let rerender: (ui: React.ReactElement) => void;
    let container: HTMLElement;

    await act(async () => {
      const result = render(
        <ChatInputArea {...baseProps} showSearch={true} editingMessage={null} />
      );
      rerender = result.rerender;
      container = result.container;
    });

    const textarea = container!.querySelector('textarea');
    expect(textarea).toBeTruthy();

    const focusSpy = vi.spyOn(textarea!, 'focus');

    await act(async () => {
      rerender!(<ChatInputArea {...baseProps} showSearch={false} editingMessage={null} />);
    });

    expect(focusSpy).toHaveBeenCalled();
  });
});
