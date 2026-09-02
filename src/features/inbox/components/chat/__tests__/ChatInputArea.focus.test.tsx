/**
 * P25 — Testes de gestão de foco no ChatInputArea
 * Verifica: inputRef.current.focus() é chamado quando editingMessage muda.
 *
 * Estratégia: renderizar com ChatTextarea mockado (passa ref para textarea real),
 * depois usar vi.spyOn no elemento montado — não pré-setar mock no ref antes do render
 * (o mount sobrescreveria o current com o DOM element).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
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
    mentionOpen: false,
    mentionCursorPos: 0,
    checkForMention: vi.fn(),
    handleMentionSelect: vi.fn(),
    closeMention: vi.fn(),
  }),
}));
vi.mock('../MarkdownPreview', () => ({ MarkdownPreview: () => null }));
vi.mock('../ChatInputQueueDisplay', () => ({ ChatInputQueueDisplay: () => null }));
vi.mock('../ChatQueueProgress', () => ({ ChatQueueProgress: () => null }));
vi.mock('../ChatAttachmentPreview', () => ({ ChatAttachmentPreview: () => null }));
vi.mock('../ChatToolbar', () => ({ ChatToolbar: () => null }));
vi.mock('../ChatSendButtons', () => ({ ChatSendButtons: () => null }));
/** Mock que materializa a textarea real e conecta o inputRef ao DOM element */
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

const makeMsg = (id: string): Message => ({
  id,
  conversationId: 'conv-1',
  content: 'hello',
  type: 'text',
  sender: 'agent',
  timestamp: new Date('2026-01-01T12:00:00Z'),
  status: 'sent',
});

function makeInputRef() {
  return React.createRef<HTMLTextAreaElement>() as React.MutableRefObject<HTMLTextAreaElement | null>;
}

function makeBaseProps(inputRef: React.RefObject<HTMLTextAreaElement | null>) {
  return {
    conversationId: 'conv-1',
    messages: [makeMsg('m1')],
    isSending: false,
    isRecordingAudio: false,
    inputValue: '',
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    onReply: vi.fn(),
    onBlur: vi.fn(),
    onKeyDown: vi.fn(),
    onCancelReply: vi.fn(),
    onRecordToggle: vi.fn(),
    onAudioSend: vi.fn(),
    onAudioCancel: vi.fn(),
    onOpenInteractiveBuilder: vi.fn(),
    onOpenSchedule: vi.fn(),
    onOpenLocationPicker: vi.fn(),
    onSendProduct: vi.fn(),
    onSendSticker: vi.fn(),
    onSendAudioMeme: vi.fn(),
    onSendCustomEmoji: vi.fn(),
    onSelectSuggestion: vi.fn(),
    onSelectTemplate: vi.fn(),
    onSlashCommand: vi.fn(),
    onCloseSlashCommands: vi.fn(),
    onQuickReply: vi.fn(),
    replyToMessage: null as Message | null,
    showSlashCommands: false,
    quickReplies: [] as never[],
    contactId: 'c1',
    contactPhone: '5511999',
    contactName: 'Test',
    fileUploaderRef: React.createRef() as React.RefObject<never>,
    inputRef,
  };
}

describe('ChatInputArea — focus management (P25)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('editingMessage setado → inputRef.current.focus() chamado', async () => {
    const inputRef = makeInputRef();
    const props = makeBaseProps(inputRef);
    let rerender!: (ui: React.ReactElement) => void;

    await act(async () => {
      const result = render(<ChatInputArea {...props} editingMessage={null} />);
      rerender = result.rerender;
    });

    // Após mount, inputRef.current é o textarea real — espionar AGORA
    const focusSpy = vi.spyOn(inputRef.current!, 'focus').mockImplementation(() => {});

    await act(async () => {
      rerender(<ChatInputArea {...props} editingMessage={makeMsg('m-edit')} />);
    });

    expect(focusSpy).toHaveBeenCalled();
  });

  it('editingMessage volta a null → focus chamado novamente', async () => {
    const inputRef = makeInputRef();
    const props = makeBaseProps(inputRef);
    const msg = makeMsg('m-e1');
    let rerender!: (ui: React.ReactElement) => void;

    await act(async () => {
      const result = render(<ChatInputArea {...props} editingMessage={msg} />);
      rerender = result.rerender;
    });

    const focusSpy = vi.spyOn(inputRef.current!, 'focus').mockImplementation(() => {});

    await act(async () => {
      rerender(<ChatInputArea {...props} editingMessage={null} />);
    });

    expect(focusSpy).toHaveBeenCalled();
  });

  it('showSearch como prop não quebra o componente (smoke test)', async () => {
    const inputRef = makeInputRef();
    const props = makeBaseProps(inputRef);

    // showSearch é prop válida na interface — não deve causar erro
    await act(async () => {
      render(<ChatInputArea {...props} showSearch={false} editingMessage={null} />);
    });

    // Componente renderizou sem throw
    expect(inputRef.current).not.toBeNull();
  });
});
