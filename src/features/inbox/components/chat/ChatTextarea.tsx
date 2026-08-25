/**
 * P12 (E61) — ChatTextarea
 * Bloco extraído de ChatInputArea.tsx — área de digitação.
 * Encapsula: MentionAutocomplete, markdown preview, <textarea>, char counter.
 * P18 — drag-drop: onFileDrop + isDragOver ring visual.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from '@/components/ui/motion';
import { MentionAutocomplete, useMentions } from './MentionAutocomplete';
import { MarkdownPreview } from './MarkdownPreview';
import type { useChatInputLogic } from './useChatInputLogic';
import type { Message } from '@/types/chat';

interface ChatTextareaProps {
  logic: ReturnType<typeof useChatInputLogic>;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  inputId?: string;
  isSending?: boolean;
  isWhisper?: boolean;
  replyToMessage: Message | null;
  editingMessage?: Message | null;
  messages: Message[];
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onEditStart?: (msg: Message) => void;
  /** P18: recebe arquivos soltos via drag-drop */
  onFileDrop?: (files: File[]) => void;
}

/** Ref helper — compatível com RefObject<T | null> e RefCallback<T> */
function asRef<T>(ref: React.RefObject<T | null>): React.RefCallback<T> {
  return (el) => {
    (ref as React.MutableRefObject<T | null>).current = el;
  };
}

export function ChatTextarea({
  logic,
  inputRef,
  inputValue,
  inputId,
  isSending,
  isWhisper,
  replyToMessage,
  editingMessage,
  messages,
  onInputChange,
  onKeyDown,
  onEditStart,
  onFileDrop,
}: ChatTextareaProps) {
  // B1b FIX: useMentions recebe inputRef (RefObject), não { inputValue }
  // B1e FIX: nomes corretos — useMentions retorna isOpen/cursorPos/handleSelect/close
  const safeRef = inputRef ?? ({ current: null } as React.RefObject<HTMLTextAreaElement | null>);
  const {
    isOpen: mentionOpen,
    cursorPos: mentionCursorPos,
    checkForMention,
    handleSelect: handleMentionSelect,
    close: closeMention,
  } = useMentions(safeRef);

  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="relative min-w-0 flex-1">
      <MentionAutocomplete
        inputValue={inputValue}
        cursorPosition={mentionCursorPos}
        onSelect={handleMentionSelect}
        onClose={closeMention}
        isOpen={mentionOpen}
      />

      <AnimatePresence>
        {logic.showMarkdownPreview && logic.hasText && logic.showRichToolbar && (
          <motion.div
            key="markdown-preview"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="mb-2 max-h-[120px] overflow-y-auto rounded-2xl border border-border/10 bg-muted/20 px-4 py-3 text-[13px] shadow-sm backdrop-blur-sm"
          >
            <MarkdownPreview text={inputValue} className="leading-snug text-foreground/90" />
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={asRef(inputRef)}
        id={inputId}
        value={inputValue}
        onChange={(e) => {
          onInputChange(e);
          checkForMention(e.target.value, e.target.selectionStart ?? 0);
        }}
        onKeyDown={(e) => {
          // Delega ao handler pai primeiro — permite quick replies capturarem Enter.
          onKeyDown(e);
          if (e.defaultPrevented) return;

          // Enter to send, Shift+Enter for new line
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isSending && logic.canSend) {
              logic.handleSendWithAnimation();
            }
            return;
          }

          if (e.key === 'ArrowUp' && !inputValue && messages.length > 0) {
            const lastOwnMessage = [...messages]
              .reverse()
              .find((m) => m.sender === 'agent' && !m.is_deleted);
            if (lastOwnMessage && onEditStart) {
              // ArrowUp com input vazio: abre o modo de edição da última
              // mensagem própria (o hook valida a janela de 15 minutos).
              e.preventDefault();
              onEditStart(lastOwnMessage);
            }
          }
        }}
        onPaste={logic.handlePaste}
        onClick={(e) => {
          const t = e.target as HTMLTextAreaElement;
          checkForMention(t.value, t.selectionStart ?? 0);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (isSending) return;
          onFileDrop?.(Array.from(e.dataTransfer.files));
        }}
        placeholder={
          editingMessage
            ? 'Editar mensagem...'
            : replyToMessage
              ? 'Digite sua resposta...'
              : isWhisper
                ? 'Sussurro interno (apenas agentes)...'
                : 'Escreva sua mensagem...'
        }
        rows={1}
        className={cn(
          'w-full rounded-[24px] border border-border/10 bg-muted/30 text-[15px] font-semibold tracking-normal text-foreground shadow-sm outline-none hover:bg-muted/50 focus:border-primary/20 focus:bg-background',
          'resize-none transition-all duration-500 ease-out placeholder:font-normal placeholder:text-muted-foreground/30',
          'focus:shadow-lg focus:ring-4 focus:ring-primary/5',
          logic.isMobile
            ? 'max-h-[160px] min-h-[48px] px-5 py-3.5 text-[16px]'
            : 'max-h-[220px] min-h-[48px] px-5 py-[14px]',
          isWhisper && 'border-warning/20 bg-warning/5 ring-amber-500/30 focus:bg-warning/10',
          logic.isOverLimit && 'text-destructive',
          isSending && 'pointer-events-none opacity-60',
          isDragOver && 'ring-2 ring-primary'
        )}
        disabled={isSending}
        aria-label={
          editingMessage
            ? 'Editar mensagem'
            : replyToMessage
              ? 'Responder mensagem'
              : 'Digite sua mensagem'
        }
        aria-describedby={logic.charCount > 100 ? 'char-counter' : undefined}
      />
      {logic.charCount > 100 && (
        <span
          id="char-counter"
          className={cn(
            'pointer-events-none absolute bottom-2 right-4 select-none text-[9px] tracking-tighter transition-colors',
            logic.isOverLimit
              ? 'font-bold text-destructive'
              : logic.isNearLimit
                ? 'text-warning'
                : 'text-muted-foreground/30'
          )}
        >
          {logic.charCount}/{logic.CHAR_LIMIT}
        </span>
      )}
    </div>
  );
}
