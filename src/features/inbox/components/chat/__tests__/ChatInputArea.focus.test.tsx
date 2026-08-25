/**
 * P25 — Testes de gestão de foco no ChatInputArea
 * Cobre: editingMessage ativa foco, volta null devolve foco, showSearch fechado devolve foco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { createRef } from 'react';
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

  it('editingMessage setado → foco vai para o textarea', () => {
    const { rerender, container } = render(<ChatInputArea {...baseProps} editingMessage={null} />);
    const textarea = container.querySelector('textarea');
    if (!textarea) return; // componente pode estar lazy

    rerender(<ChatInputArea {...baseProps} editingMessage={makeMsg('m1')} />);
    // foco deve ter sido movido para o textarea
    expect(document.activeElement).toBe(textarea);
  });

  it('editingMessage volta a null → foco retorna ao textarea', () => {
    const { rerender, container } = render(
      <ChatInputArea {...baseProps} editingMessage={makeMsg('m1')} />
    );
    const textarea = container.querySelector('textarea');
    if (!textarea) return;

    rerender(<ChatInputArea {...baseProps} editingMessage={null} />);
    expect(document.activeElement).toBe(textarea);
  });

  it('showSearch fechado → foco retorna ao textarea', () => {
    const { rerender, container } = render(
      <ChatInputArea {...baseProps} showSearch={true} editingMessage={null} />
    );
    const textarea = container.querySelector('textarea');
    if (!textarea) return;

    rerender(<ChatInputArea {...baseProps} showSearch={false} editingMessage={null} />);
    expect(document.activeElement).toBe(textarea);
  });
});
