/**
 * G1 — Testes dedicados para ChatTextarea (P12/E61)
 * Confirma os 5 bugs B1 corrigidos pela auditoria de 5 agentes (2026-08-25):
 *   B1a: componente tem return → renderiza o <textarea>
 *   B1b: useMentions(inputRef) — não { inputValue }
 *   B1c: onEditStart destrutured — não props.onEditStart
 *   B1d: sem onBlur indefinido
 *   B1e: aliases corretos (isOpen→mentionOpen, cursorPos→mentionCursorPos, ...)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...p }: Record<string, unknown>) => (
      <div {...p}>{children as React.ReactNode}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/utils', () => ({ cn: (...a: unknown[]) => a.filter(Boolean).join(' ') }));

// Mock useMentions com assinatura CORRETA — recebe RefObject, retorna {isOpen, cursorPos, handleSelect, close}
const checkForMentionMock = vi.fn();
const handleSelectMock = vi.fn();
const closeMock = vi.fn();

vi.mock('../MentionAutocomplete', () => ({
  MentionAutocomplete: () => null,
  useMentions: (ref: React.RefObject<HTMLTextAreaElement | null>) => {
    // B1b CONFIRMADO: ref deve ser um RefObject com .current, não {inputValue: string}
    expect(typeof ref).toBe('object');
    expect('current' in ref).toBe(true);
    return {
      isOpen: false,
      cursorPos: 0,
      checkForMention: checkForMentionMock,
      handleSelect: handleSelectMock,
      close: closeMock,
    };
  },
}));
vi.mock('../MarkdownPreview', () => ({ MarkdownPreview: () => null }));

import { ChatTextarea } from '../ChatTextarea';
import type { Message } from '@/types/chat';

const makeMsg = (id = 'm1'): Message => ({
  id,
  conversationId: 'conv-1',
  content: 'oi',
  type: 'text',
  sender: 'agent',
  timestamp: new Date('2026-01-01T12:00:00Z'),
  status: 'sent',
});

/** Mock mínimo de useChatInputLogic ReturnType */
const makeMockLogic = (overrides = {}) => ({
  showMarkdownPreview: false,
  hasText: false,
  showRichToolbar: false,
  canSend: true,
  isMobile: false,
  charCount: 0,
  isOverLimit: false,
  isNearLimit: false,
  CHAR_LIMIT: 4096,
  handleSendWithAnimation: vi.fn(),
  handlePaste: vi.fn(),
  ...overrides,
});

describe('ChatTextarea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkForMentionMock.mockClear();
  });

  describe('B1a — return statement presente', () => {
    it('renderiza o <textarea> no DOM', () => {
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[]}
          replyToMessage={null}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );
      expect(screen.getByRole('textbox')).toBeTruthy();
    });

    it('expõe data-testid="chat-textarea" (usado por e2e/inbox/chat-drag-drop.spec.ts)', () => {
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[]}
          replyToMessage={null}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );
      expect(screen.getByTestId('chat-textarea')).toBeTruthy();
    });
  });

  describe('B1b — useMentions recebe RefObject', () => {
    it('useMentions mock confirma que recebeu RefObject (não {inputValue})', () => {
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      // Se useMentions recebe {inputValue} em vez de RefObject, o mock vai falhar
      // O mock tem expect() interno que verifica 'current' in ref
      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue="texto"
          messages={[]}
          replyToMessage={null}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );
      // Chegou aqui sem throw = useMentions recebeu RefObject ✅
    });
  });

  describe('B1c — onEditStart destrutured', () => {
    it('ArrowUp com input vazio chama onEditStart (destrutured, não props.onEditStart)', () => {
      const onEditStart = vi.fn();
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      const msg = makeMsg('m-owned');

      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[msg]}
          replyToMessage={null}
          editingMessage={null}
          onEditStart={onEditStart}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'ArrowUp' });
      expect(onEditStart).toHaveBeenCalledWith(msg);
    });

    it('ArrowUp NÃO chama onEditStart quando input tem texto', () => {
      const onEditStart = vi.fn();
      const inputRef = React.createRef<HTMLTextAreaElement | null>();

      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue="tem texto"
          messages={[makeMsg()]}
          replyToMessage={null}
          onEditStart={onEditStart}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowUp' });
      expect(onEditStart).not.toHaveBeenCalled();
    });
  });

  describe('B1d — sem onBlur indefinido', () => {
    it('renderiza sem erro (onBlur não está nos props)', () => {
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      expect(() =>
        render(
          <ChatTextarea
            logic={makeMockLogic() as never}
            inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
            inputValue=""
            messages={[]}
            replyToMessage={null}
            onInputChange={vi.fn()}
            onKeyDown={vi.fn()}
          />
        )
      ).not.toThrow();
    });
  });

  describe('checkForMention chamado no onChange', () => {
    it('dispara checkForMention ao digitar', () => {
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      const onInputChange = vi.fn();

      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[]}
          replyToMessage={null}
          onInputChange={onInputChange}
          onKeyDown={vi.fn()}
        />
      );

      fireEvent.change(screen.getByRole('textbox'), { target: { value: '@ag' } });
      expect(checkForMentionMock).toHaveBeenCalled();
      expect(onInputChange).toHaveBeenCalled();
    });
  });

  describe('placeholder dinâmico', () => {
    it('placeholder padrão sem contexto', () => {
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[]}
          replyToMessage={null}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );
      expect(screen.getByPlaceholderText('Escreva sua mensagem...')).toBeTruthy();
    });

    it('placeholder de edição quando editingMessage presente', () => {
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[]}
          replyToMessage={null}
          editingMessage={makeMsg()}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );
      expect(screen.getByPlaceholderText('Editar mensagem...')).toBeTruthy();
    });

    it('placeholder whisper quando isWhisper=true', () => {
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[]}
          replyToMessage={null}
          isWhisper={true}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );
      expect(screen.getByPlaceholderText('Sussurro interno (apenas agentes)...')).toBeTruthy();
    });
  });

  describe('drag-drop (P18)', () => {
    it('onFileDrop chamado ao dropar arquivo quando não está enviando', () => {
      const onFileDrop = vi.fn();
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[]}
          replyToMessage={null}
          isSending={false}
          onFileDrop={onFileDrop}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );
      const textarea = screen.getByRole('textbox');
      const file = new File([''], 'test.png', { type: 'image/png' });
      fireEvent.drop(textarea, {
        dataTransfer: { files: [file] },
      });
      expect(onFileDrop).toHaveBeenCalledWith([file]);
    });

    it('onFileDrop NÃO chamado quando isSending=true', () => {
      const onFileDrop = vi.fn();
      const inputRef = React.createRef<HTMLTextAreaElement | null>();
      render(
        <ChatTextarea
          logic={makeMockLogic() as never}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          inputValue=""
          messages={[]}
          replyToMessage={null}
          isSending={true}
          onFileDrop={onFileDrop}
          onInputChange={vi.fn()}
          onKeyDown={vi.fn()}
        />
      );
      const textarea = screen.getByRole('textbox');
      const file = new File([''], 'test.png', { type: 'image/png' });
      fireEvent.drop(textarea, { dataTransfer: { files: [file] } });
      expect(onFileDrop).not.toHaveBeenCalled();
    });
  });
});
