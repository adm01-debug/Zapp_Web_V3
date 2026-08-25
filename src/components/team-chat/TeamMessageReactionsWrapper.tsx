/**
 * @file TeamMessageReactionsWrapper.tsx
 * @description Wrapper do team-chat: adapta AggregatedReaction → ReactionGroup
 * e usa MessageReactionBar + QuickReactionStrip do canônico.
 * Corrigido para alinhar com a interface de message-reactions.tsx — E58.
 */
import { useCallback } from 'react';
import {
  MessageReactionBar,
  QuickReactionStrip,
  EXTENDED_EMOJIS,
} from '@/components/ui/message-reactions';
import type { ReactionGroup } from '@/components/ui/message-reactions';
import type { AggregatedReaction } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';

/** Converte AggregatedReaction (team-chat) → ReactionGroup (canônico). */
function toGroup(r: AggregatedReaction): ReactionGroup {
  return {
    emoji: r.emoji,
    count: r.count,
    reactedByMe: r.reactedByMe,
    // AggregatedReaction não carrega nomes — tooltip desabilitado
  };
}

// ─── TeamReactionBar ──────────────────────────────────────────────────────────

interface TeamReactionBarProps {
  messageId: string;
  reactions: AggregatedReaction[];
  isMine: boolean;
  onToggle: (emoji: string) => void;
  isToggling?: boolean;
}

/**
 * Barra de reações posicionada abaixo da bolha (-bottom-3).
 * Usa MessageReactionBar canônico.
 */
export function TeamReactionBar({ messageId, reactions, isMine, onToggle }: TeamReactionBarProps) {
  return (
    <MessageReactionBar
      messageId={messageId}
      reactions={reactions.map(toGroup)}
      isSent={isMine}
      onReact={onToggle}
      availableEmojis={EXTENDED_EMOJIS}
    />
  );
}

// ─── TeamQuickReactionBarWrapper ──────────────────────────────────────────────

interface TeamQuickBarProps {
  messageId: string;
  isMine: boolean;
  onToggle: (emoji: string) => void;
  reactions?: AggregatedReaction[];
}

/**
 * Strip flutuante de emojis rápidos. Usa QuickReactionStrip canônico.
 */
export function TeamQuickReactionBarWrapper({
  messageId,
  isMine,
  onToggle,
  reactions = [],
}: TeamQuickBarProps) {
  const hasReacted = useCallback(
    (emoji: string) => reactions.some((r) => r.emoji === emoji && r.reactedByMe),
    [reactions]
  );

  return (
    <QuickReactionStrip
      messageId={messageId}
      isSent={isMine}
      onReact={onToggle}
      hasReacted={hasReacted}
    />
  );
}
