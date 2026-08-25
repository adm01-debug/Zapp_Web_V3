/**
 * @file ComposerCore.tsx
 * @description Shell visual compartilhado entre ChatInputArea (inbox) e
 * TeamChatInputArea (team-chat). Encapsula o layout do compositor:
 *   [+ popover] [textarea + overlays] [send + mic] [secondary toolbar]
 *
 * NÃO contém lógica de negócio (queue, drafts, mentions, slash commands).
 * Cada consumidor injeta sua lógica via slots e callbacks.
 *
 * E55 — feat/chat-ui-100
 */
import { ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Send, Mic, Plus, Loader2, Check } from 'lucide-react';
// i18n-todo: mover copy.ts para src/lib/chat-copy.ts quando ComposerCore sair do escopo inbox
import { COPY } from '@/features/inbox/components/chat/copy';
import { COPY } from '@/features/inbox/components/chat/copy';

export interface ComposerCoreProps {
  // ─── Valor e callbacks obrigatórios ────────────────────────────────────────
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onRecordToggle: () => void;

  // ─── Estado ────────────────────────────────────────────────────────────────
  /** Bloqueia envio e mostra spinner no botão Send */
  isSending?: boolean;
  /** Habilita o botão Send (tem texto ou anexo) */
  canSend?: boolean;
  /** Substitui ícone Send por Check */
  isEditing?: boolean;
  /** Mic pulsando + botão vermelho */
  isMicActive?: boolean;
  /** Impede Mic e ferramentas secundárias */
  isRecordingAudio?: boolean;
  /** Modo whisper: borda âmbar + fundo âmbar */
  isWhisper?: boolean;
  /** Desabilita o compositor inteiro */
  disabled?: boolean;
  /** Modo mobile: tamanhos ligeiramente maiores */
  isMobile?: boolean;

  // ─── Contador de caracteres ────────────────────────────────────────────────
  charCount?: number;
  charLimit?: number;
  isOverLimit?: boolean;
  isNearLimit?: boolean;

  // ─── Refs e a11y ──────────────────────────────────────────────────────────
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  ariaLabel?: string;

  // ─── Handlers adicionais ──────────────────────────────────────────────────
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;

  // ─── Slots ────────────────────────────────────────────────────────────────
  slots?: {
    /**
     * Conteúdo do Popover do botão "+".
     * Se ausente, o botão "+" não é renderizado.
     */
    plusMenuContent?: ReactNode;
    /**
     * Renderizado acima do textarea (ex: MentionAutocomplete).
     * Posicionado relativamente ao container do textarea.
     */
    beforeTextarea?: ReactNode;
    /**
     * Renderizado sobre o textarea (ex: MarkdownPreview).
     * Posicionado com AnimatePresence acima do textarea.
     */
    textareaOverlay?: ReactNode;
    /**
     * Renderizado após o botão Mic (ex: SecondaryToolbar, RichTextToggle).
     */
    afterMic?: ReactNode;
    /**
     * Renderizado abaixo da row principal (ex: mobile quick tools).
     */
    footer?: ReactNode;
  };

  className?: string;
}

/**
 * Shell visual do compositor. Renderiza apenas o `div role="form"` e seus
 * filhos. O `beforeForm` (attachments preview, queue, RichTextToolbar) deve
 * ser renderizado pelo consumidor antes deste componente.
 */
export const ComposerCore = forwardRef<HTMLDivElement, ComposerCoreProps>(function ComposerCore(
  {
    value,
    onChange,
    onSend,
    onRecordToggle,
    isSending = false,
    canSend = false,
    isEditing = false,
    isMicActive = false,
    isRecordingAudio = false,
    isWhisper = false,
    disabled = false,
    isMobile = false,
    charCount,
    charLimit,
    isOverLimit = false,
    isNearLimit = false,
    inputRef,
    placeholder = COPY.composer.placeholder,
    ariaLabel = COPY.composer.inputLabel,
    onKeyDown,
    onBlur,
    onPaste,
    onClick,
    slots = {},
    className,
  },
  ref
) {
  const showCounter = charCount !== undefined && charLimit !== undefined && charCount > 100;
  const micDisabled = isSending || canSend;

  return (
    <TooltipProvider>
      <div
        ref={ref}
        className={cn(
          'relative flex shrink-0 flex-col gap-3 border-t border-border/10 bg-background/95',
          'px-4 py-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] backdrop-blur-3xl transition-all duration-500',
          '@container md:px-10 md:py-6',
          isWhisper && 'border-t-2 border-warning bg-warning/10 shadow-warning/10',
          isMobile && 'safe-area-bottom px-3 py-4 pb-8',
          className
        )}
        role="form"
        aria-label={COPY.composer.formLabel}
      >
        <div className="flex flex-col gap-2" role="toolbar" aria-label={COPY.composer.toolbarLabel}>
          {/* SINGLE ROW: [+] [textarea] [send+mic] [secondary] */}
          <div className="flex w-full items-end gap-1.5">
            {/* ─── "+" button ─────────────────────────────────────────────── */}
            {slots.plusMenuContent && (
              <Popover>
                <PopoverTrigger asChild>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className={cn(
                      'inline-flex shrink-0 items-center justify-center self-end rounded-full',
                      'text-[hsl(var(--muted-foreground))] outline-none transition-all',
                      'hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-primary',
                      isMobile ? 'mb-0.5 h-11 w-11' : 'mb-[3px] h-[42px] w-[42px]'
                    )}
                    aria-label={COPY.composer.plusLabel}
                  >
                    <Plus className="h-6 w-6" />
                  </motion.button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-60 border-border/40 bg-popover/95 p-2 shadow-2xl backdrop-blur-md duration-300 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2"
                  align="start"
                  side="top"
                >
                  {slots.plusMenuContent}
                </PopoverContent>
              </Popover>
            )}

            {/* ─── Textarea ───────────────────────────────────────────────── */}
            <div className="relative min-w-0 flex-1">
              {slots.beforeTextarea}

              {slots.textareaOverlay}

              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onBlur={onBlur}
                onPaste={onPaste}
                onClick={onClick}
                placeholder={placeholder}
                rows={1}
                disabled={disabled || isSending}
                aria-label={ariaLabel}
                aria-describedby={showCounter ? 'composer-char-counter' : undefined}
                className={cn(
                  'w-full rounded-[24px] border border-border/10 bg-muted/30 text-[15px] font-semibold',
                  'tracking-normal text-foreground shadow-sm outline-none',
                  'hover:bg-muted/50 focus:border-primary/20 focus:bg-background',
                  'resize-none transition-all duration-500 ease-out placeholder:font-normal placeholder:text-muted-foreground/30',
                  'focus:shadow-lg focus:ring-4 focus:ring-primary/5',
                  isMobile
                    ? 'max-h-[160px] min-h-[48px] px-5 py-3.5 text-[16px]'
                    : 'max-h-[220px] min-h-[48px] px-5 py-[14px]',
                  isWhisper &&
                    'border-warning/20 bg-warning/5 ring-amber-500/30 focus:bg-warning/10',
                  isOverLimit && 'text-destructive',
                  isSending && 'pointer-events-none opacity-60'
                )}
              />

              {showCounter && (
                <span
                  id="composer-char-counter"
                  className={cn(
                    'pointer-events-none absolute bottom-2 right-4 select-none text-[9px] tracking-tighter transition-colors',
                    isOverLimit
                      ? 'font-bold text-destructive'
                      : isNearLimit
                        ? 'text-warning'
                        : 'text-muted-foreground/30'
                  )}
                >
                  {charCount}/{charLimit}
                </span>
              )}
            </div>

            {/* ─── Send + Mic ─────────────────────────────────────────────── */}
            <div className="mb-[1px] flex shrink-0 items-center gap-2 self-end">
              {/* Enviando... label (desktop) */}
              {isSending && !isMobile && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground"
                >
                  {COPY.composer.sendingInline}
                </motion.span>
              )}

              {/* Send */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    onClick={onSend}
                    disabled={isSending}
                    whileHover={!isSending ? { scale: 1.1 } : {}}
                    whileTap={!isSending ? { scale: 0.9 } : {}}
                    aria-label={isSending ? COPY.composer.sendingLabel : COPY.composer.sendLabel}
                    aria-disabled={isSending || !canSend}
                    className={cn(
                      'inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full outline-none',
                      'transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      canSend
                        ? 'bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.55),0_0_36px_hsl(var(--primary)/0.35)] ring-2 ring-primary/40 hover:shadow-[0_0_24px_hsl(var(--primary)/0.7),0_0_48px_hsl(var(--primary)/0.45)]'
                        : 'cursor-not-allowed bg-muted text-muted-foreground opacity-50 hover:bg-muted/80',
                      isMobile ? 'h-11 w-11' : 'h-[46px] w-[46px]'
                    )}
                  >
                    <AnimatePresence mode="wait">
                      {isSending ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                        >
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </motion.div>
                      ) : isEditing ? (
                        <motion.div
                          key="edit"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                        >
                          <Check className="h-6 w-6" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="send"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                        >
                          <Send className="h-6 w-6" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[200px] rounded-lg border-none bg-primary px-3 py-1.5 text-[10px] font-medium text-primary-foreground shadow-xl"
                >
                  {isSending
                    ? COPY.composer.tooltipSending
                    : isOverLimit
                      ? COPY.composer.tooltipOverLimit
                      : !canSend
                        ? COPY.composer.tooltipAttach
                        : isEditing
                          ? COPY.composer.tooltipEdit
                          : COPY.composer.sendTooltipDefault}
                </TooltipContent>
              </Tooltip>

              {/* Mic */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    onClick={onRecordToggle}
                    disabled={micDisabled}
                    whileHover={!micDisabled ? { scale: 1.1 } : {}}
                    whileTap={!micDisabled ? { scale: 0.9 } : {}}
                    aria-label={
                      isMicActive ? COPY.composer.micActiveLabel : COPY.composer.micIdleLabel
                    }
                    aria-disabled={micDisabled}
                    aria-pressed={isMicActive}
                    className={cn(
                      'inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full outline-none',
                      'transition-all duration-300 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2',
                      isMicActive
                        ? 'z-10 scale-110 bg-destructive text-foreground shadow-[0_0_24px_rgba(244,63,94,0.7),0_0_48px_rgba(244,63,94,0.45)] ring-2 ring-rose-400/60 hover:bg-destructive'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      !isMicActive && micDisabled && 'cursor-not-allowed opacity-50',
                      isMobile ? 'h-11 w-11' : 'h-[46px] w-[46px]'
                    )}
                  >
                    <Mic className={cn('h-6 w-6', isMicActive && 'animate-pulse')} />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[200px] rounded-lg border-none bg-destructive px-3 py-1.5 text-[10px] font-medium text-foreground shadow-xl"
                >
                  {isMicActive
                    ? COPY.composer.tooltipMicActive
                    : canSend
                      ? COPY.composer.tooltipMicCantRecord
                      : isSending
                        ? COPY.composer.tooltipMicWaiting
                        : COPY.composer.tooltipMicIdle}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* ─── Secondary toolbar slot ──────────────────────────────────── */}
            {slots.afterMic && (
              <div
                className={cn('mb-[3px] flex shrink-0 items-center self-end', isMobile && 'mb-0')}
              >
                {slots.afterMic}
              </div>
            )}
          </div>
        </div>

        {/* ─── Footer slot (mobile quick tools, etc.) ──────────────────────── */}
        {slots.footer}
      </div>
    </TooltipProvider>
  );
});

ComposerCore.displayName = 'ComposerCore';
