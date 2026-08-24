/**
 * @file TeamMessageReactionsWrapper.tsx
 * @description Wrapper do team-chat: adapta AggregatedReaction → ReactionSummary
 * e re-exporta ReactionBar + QuickReactionBar do canônico.
 *
 * E58 — feat/chat-ui-100
 */
import {
  ReactionBar,
  QuickReactionBar,
  ReactionSummary,
  EXTENDED_EMOJIS,
} from '@/components/ui/message-reactions';
import type { AggregatedReaction } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';

/** Converte AggregatedReaction (team-chat) → ReactionSummary (canônico). */
function toSummary(r: AggregatedReaction): ReactionSummary {
  return {
    emoji: r.emoji,
    count: r.count,
    reactedByMe: r.reactedByMe,
    // AggregatedReaction não carrega nomes — tooltip omitido
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
 * Substitui o MessageReactions do team-chat.
 * Usa ReactionBar canônico, posicionado abaixo da bolha (-bottom-3).
 */
export function TeamReactionBar({ messageId, reactions, isMine, onToggle }: TeamReactionBarProps) {
  return (
    <div
      className="absolute -bottom-3 z-10"
      data-is-toggling={false}
      data-testid={`reactions-container-${messageId}`}
    >
      <ReactionBar
        messageId={messageId}
        reactions={reactions.map(toSummary)}
        onToggle={onToggle}
        isSent={isMine}
        pickerEmojis={EXTENDED_EMOJIS}
        className="mt-0 flex-nowrap"
      />
    </div>
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
 * Substitui o TeamQuickReactionBar do team-chat.
 */
export function TeamQuickReactionBarWrapper({
  messageId,
  isMine,
  onToggle,
  reactions = [],
}: TeamQuickBarProps) {
  return (
    <QuickReactionBar
      messageId={messageId}
      reactions={reactions.map(toSummary)}
      onToggle={onToggle}
      isSent={isMine}
    />
  );
}
