/**
 * @file message-reactions.tsx
 * @description Componentes de reações canônicos — display puro, sem hooks de negócio.
 * Cada contexto (inbox/team-chat) fornece dados via props e mantém seus próprios hooks.
 *
 * Exports:
 *   WHATSAPP_EMOJIS   — 6 emojis rápidos WhatsApp
 *   EXTENDED_EMOJIS   — 20 emojis incluindo os 6 básicos
 *   ReactionGroup     — tipo canônico (substituí AggregatedReaction e groupedReactions)
 *   ReactionBadge     — badge individual (emoji + count)
 *   ReactionPicker    — popover/grid de emojis para escolher
 *   MessageReactionBar — barra de badges + trigger do picker
 *   QuickReactionStrip — strip flutuante acima da mensagem
 *
 * E57 — feat/chat-ui-100
 */
import { memo, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion } from '@/components/ui/motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SmilePlus } from 'lucide-react';

// ─── Constantes de emoji ───────────────────────────────────────────────────────

export const WHATSAPP_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export const EXTENDED_EMOJIS = [
  ...WHATSAPP_EMOJIS,
  '🔥',
  '🎉',
  '👏',
  '💯',
  '✅',
  '❌',
  '👀',
  '🤔',
  '😍',
  '😎',
  '🚀',
  '💪',
  '🙌',
  '👌',
  '✨',
] as const;

// ─── Tipo canônico ─────────────────────────────────────────────────────────────

/** Tipo canônico de grupo de reações. Substituí AggregatedReaction e groupedReactions. */
export interface ReactionGroup {
  emoji: string;
  count: number;
  /** Usuários que reagiram — usado no tooltip do inbox */
  users?: string[];
  /** O usuário atual já reagiu com este emoji */
  reactedByMe: boolean;
}

// ─── ReactionBadge ─────────────────────────────────────────────────────────────

interface ReactionBadgeProps {
  reaction: ReactionGroup;
  onClick: (emoji: string) => void;
  messageId?: string;
  showTooltip?: boolean;
}

/** Badge individual de reação — emoji + contador + estado ativo. */
export const ReactionBadge = memo(function ReactionBadge({
  reaction,
  onClick,
  messageId,
  showTooltip = false,
}: ReactionBadgeProps) {
  const badge = (
    <button
      type="button"
      onClick={() => onClick(reaction.emoji)}
      className={cn(
        'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] outline-none',
        'shadow-sm transition-all hover:scale-110 active:scale-95',
        'focus-visible:ring-1 focus-visible:ring-primary',
        reaction.reactedByMe
          ? 'border-primary/20 bg-primary font-bold text-primary-foreground'
          : 'border-border/50 bg-background text-foreground hover:bg-muted/80'
      )}
      aria-pressed={reaction.reactedByMe}
      aria-label={`${reaction.emoji}, ${reaction.count} ${reaction.count === 1 ? 'reação' : 'reações'}. ${reaction.reactedByMe ? 'Você reagiu.' : 'Clique para reagir.'}`}
      data-testid={messageId ? `reaction-${messageId}-${reaction.emoji}` : undefined}
    >
      <span className="text-[11px] leading-none" aria-hidden="true">
        {reaction.emoji}
      </span>
      {reaction.count > 1 && (
        <motion.span
          key={reaction.count}
          initial={{ scale: 1.2, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          className="ml-0.5 text-[9px] font-semibold tabular-nums"
        >
          {reaction.count}
        </motion.span>
      )}
    </button>
  );

  if (!showTooltip || !reaction.users?.length) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="max-w-[150px]">
          {reaction.users.slice(0, 5).join(', ')}
          {reaction.users.length > 5 && ` +${reaction.users.length - 5}`}
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

// ─── ReactionPicker ────────────────────────────────────────────────────────────

interface ReactionPickerProps {
  emojis?: readonly string[];
  onPick: (emoji: string) => void;
  hasReacted?: (emoji: string) => boolean;
  cols?: 4 | 6 | 8;
}

/** Grid de emojis para escolher reação — usado dentro de Popover. */
export const ReactionPicker = memo(function ReactionPicker({
  emojis = EXTENDED_EMOJIS,
  onPick,
  hasReacted,
  cols = 6,
}: ReactionPickerProps) {
  return (
    <div
      className={cn('grid gap-1 outline-none', {
        'grid-cols-4': cols === 4,
        'grid-cols-6': cols === 6,
        'grid-cols-8': cols === 8,
      })}
      role="grid"
      onKeyDown={(e) => {
        const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
        const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (idx === -1) return;
        const map: Record<string, number> = {
          ArrowRight: (idx + 1) % buttons.length,
          ArrowLeft: (idx - 1 + buttons.length) % buttons.length,
          ArrowDown: (idx + cols) % buttons.length,
          ArrowUp: (idx - cols + buttons.length) % buttons.length,
        };
        const next = map[e.key];
        if (next !== undefined) {
          e.preventDefault();
          buttons[next]?.focus();
        }
      }}
    >
      {emojis.map((emoji) => {
        const active = hasReacted?.(emoji) ?? false;
        return (
          <button
            type="button"
            key={emoji}
            role="gridcell"
            onClick={() => onPick(emoji)}
            aria-label={`Reagir com ${emoji}`}
            aria-pressed={active}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md text-lg outline-none',
              'transition-all hover:scale-125 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary',
              active && 'bg-primary/10 ring-1 ring-primary/30'
            )}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
});

// ─── MessageReactionBar ────────────────────────────────────────────────────────

export interface MessageReactionBarProps {
  messageId: string;
  reactions: ReactionGroup[];
  /** Lista de emojis disponíveis no picker */
  availableEmojis?: readonly string[];
  isSent?: boolean;
  onReact: (emoji: string) => void;
  showUserTooltips?: boolean;
}

/**
 * Barra de badges de reação + trigger do picker.
 * Posicionada como `absolute -bottom-3` pelo consumidor.
 */
export const MessageReactionBar = memo(function MessageReactionBar({
  messageId,
  reactions,
  availableEmojis = EXTENDED_EMOJIS,
  isSent = false,
  onReact,
  showUserTooltips = false,
}: MessageReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePick = useCallback(
    (emoji: string) => {
      onReact(emoji);
      setPickerOpen(false);
    },
    [onReact]
  );

  const withTooltips = showUserTooltips && reactions.some((r) => r.users?.length);

  const badges = reactions.map((r) => (
    <ReactionBadge
      key={r.emoji}
      reaction={r}
      onClick={onReact}
      messageId={messageId}
      showTooltip={withTooltips}
    />
  ));

  return (
    <div
      className={cn(
        'absolute -bottom-3 z-10 flex items-center gap-0.5',
        isSent ? 'right-2' : 'left-2'
      )}
      role="group"
      aria-label="Reações da mensagem"
      data-testid={`reactions-container-${messageId}`}
    >
      {withTooltips ? <TooltipProvider>{badges}</TooltipProvider> : badges}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'rounded-full p-1 outline-none transition-all',
              'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              'focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary',
              reactions.length === 0
                ? 'opacity-0 group-hover:opacity-100'
                : 'opacity-60 hover:opacity-100'
            )}
            aria-label="Adicionar reação"
            data-testid={`reaction-trigger-${messageId}`}
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align={isSent ? 'end' : 'start'}
          className="w-auto border-border bg-popover p-2 shadow-xl duration-150 animate-in fade-in zoom-in"
          role="dialog"
          aria-label="Escolher um emoji"
        >
          <ReactionPicker emojis={availableEmojis} onPick={handlePick} cols={6} />
        </PopoverContent>
      </Popover>
    </div>
  );
});

// ─── QuickReactionStrip ────────────────────────────────────────────────────────

export interface QuickReactionStripProps {
  messageId?: string;
  isSent?: boolean;
  onReact: (emoji: string) => void;
  hasReacted: (emoji: string) => boolean;
  quickEmojis?: readonly string[];
  extendedEmojis?: readonly string[];
  forceShow?: boolean;
}

/**
 * Strip flutuante de emojis rápidos — aparece acima da mensagem no hover.
 * O wrapper de posicionamento (absolute -top-9) é responsabilidade do consumidor.
 */
export const QuickReactionStrip = memo(function QuickReactionStrip({
  messageId: _messageId,
  isSent = false,
  onReact,
  hasReacted,
  quickEmojis = WHATSAPP_EMOJIS,
  extendedEmojis = EXTENDED_EMOJIS,
  forceShow = false,
}: QuickReactionStripProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleReact = useCallback(
    (emoji: string) => {
      onReact(emoji);
      setShowPicker(false);
    },
    [onReact]
  );

  return (
    <div
      className={cn(
        'absolute -top-9 z-20 flex items-center transition-all duration-200',
        'opacity-0 group-focus-within/msg:opacity-100 group-hover/msg:opacity-100',
        forceShow && 'pointer-events-auto opacity-100',
        showPicker && 'opacity-100',
        isSent ? 'right-0' : 'left-0'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.12 }}
        className="flex items-center gap-0.5 rounded-full border border-border/40 bg-card/95 px-1 py-1 shadow-xl backdrop-blur-md dark:bg-[hsl(var(--card)/0.95)]"
      >
        {quickEmojis.map((emoji) => (
          <button
            type="button"
            key={emoji}
            onClick={() => handleReact(emoji)}
            aria-label={`Reagir com ${emoji}`}
            aria-pressed={hasReacted(emoji)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-sm outline-none',
              'transition-all hover:scale-125 hover:bg-muted/80 focus-visible:ring-1 focus-visible:ring-primary',
              hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
            )}
          >
            {emoji}
          </button>
        ))}

        <Popover open={showPicker} onOpenChange={setShowPicker}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-all hover:bg-muted/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Mais reações"
            >
              <SmilePlus className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto border-border bg-popover p-2 shadow-xl duration-150 animate-in fade-in zoom-in"
            align={isSent ? 'end' : 'start'}
            sideOffset={4}
            role="dialog"
            aria-label="Escolher reações estendidas"
          >
            <ReactionPicker
              emojis={extendedEmojis}
              onPick={handleReact}
              hasReacted={hasReacted}
              cols={6}
            />
          </PopoverContent>
        </Popover>
      </motion.div>
    </div>
  );
});
