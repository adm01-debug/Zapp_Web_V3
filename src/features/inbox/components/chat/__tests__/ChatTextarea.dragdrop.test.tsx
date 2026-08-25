/**
 * P18 — ChatTextarea drag-drop tests
 * Cobre: dragover ring, drop → onFileDrop, drop com isSending → ignorado
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('framer-motion', () => {
  const passthrough = (props: { children?: unknown }) => props?.children ?? null;
  return {
    motion: new Proxy({}, { get: () => passthrough }),
    AnimatePresence: (props: { children?: unknown }) => props?.children ?? null,
    useReducedMotion: () => false,
  };
});
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

import { createRef } from 'react';
import { ChatTextarea } from '../ChatTextarea';
import type { Message } from '@/types/chat';

function makeLogic(overrides: Record<string, unknown> = {}) {
  return {
    showMarkdownPreview: false,
    hasText: false,
    showRichToolbar: false,
    isMobile: false,
    isOverLimit: false,
    isNearLimit: false,
    charCount: 0,
    CHAR_LIMIT: 4096,
    canSend: true,
    handleSendWithAnimation: vi.fn(),
    handlePaste: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof import('../useChatInputLogic').useChatInputLogic>;
}

const baseProps = {
  logic: makeLogic(),
  inputRef: createRef<HTMLTextAreaElement | null>(),
  inputValue: '',
  isSending: false,
  isWhisper: false,
  replyToMessage: null as Message | null,
  editingMessage: null as Message | null,
  messages: [] as Message[],
  onInputChange: vi.fn(),
  onKeyDown: vi.fn(),
};

describe('ChatTextarea — drag-drop (P18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dragover → aplica ring-2 ring-primary no textarea', async () => {
    render(<ChatTextarea {...baseProps} onFileDrop={vi.fn()} />);
    const textarea = screen.getByRole('textbox');

    fireEvent.dragOver(textarea, { preventDefault: vi.fn() });

    expect(textarea.className).toContain('ring-2');
    expect(textarea.className).toContain('ring-primary');
  });

  it('drop com PNG → onFileDrop chamado com o arquivo', () => {
    const onFileDrop = vi.fn();
    render(<ChatTextarea {...baseProps} onFileDrop={onFileDrop} />);
    const textarea = screen.getByRole('textbox');

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    fireEvent.drop(textarea, {
      dataTransfer: { files: [file] },
      preventDefault: vi.fn(),
    });

    expect(onFileDrop).toHaveBeenCalledOnce();
    expect(onFileDrop).toHaveBeenCalledWith([file]);
  });

  it('drop com isSending=true → onFileDrop NÃO chamado', () => {
    const onFileDrop = vi.fn();
    render(<ChatTextarea {...baseProps} isSending={true} onFileDrop={onFileDrop} />);
    const textarea = screen.getByRole('textbox');

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.drop(textarea, {
      dataTransfer: { files: [file] },
      preventDefault: vi.fn(),
    });

    expect(onFileDrop).not.toHaveBeenCalled();
  });
});
