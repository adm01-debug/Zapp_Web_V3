/**
 * @file MessageReactions.tsx (team-chat)
 * @description Wrappers do team-chat sobre os componentes canônicos de
 * src/components/ui/message-reactions.tsx — E58.
 * A lógica de negócio (toggle, AggregatedReaction) fica nos hooks do team-chat.
 */

import { memo, useCallback } from 'react';
import {
  MessageReactionBar,
  QuickReactionStrip,
  WHATSAPP_EMOJIS,
  EXTENDED_EMOJIS,
} from '@/components/ui/message-reactions';
import type { ReactionGroup } from '@/components/ui/message-reactions';
import type { AggregatedReaction } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';

export { WHATSAPP_EMOJIS as QUICK_EMOJIS, EXTENDED_EMOJIS };

/** Adapta AggregatedReaction → ReactionGroup canônico */
function toReactionGroup(r: AggregatedReaction): ReactionGroup {
  return { emoji: r.emoji, count: r.count, reactedByMe: r.reactedByMe };
}

interface Props {
  messageId: string;
  reactions: AggregatedReaction[];
  isMine: boolean;
  isToggling: boolean;
  onToggle: (emoji: string) => void;
}

/** Wrapper team-chat de MessageReactionBar. */
export const MessageReactions = memo(function MessageReactions({
  messageId,
  reactions,
  isMine,
  isToggling: _isToggling,
  onToggle,
}: Props) {
  return (
    <MessageReactionBar
      messageId={messageId}
      reactions={reactions.map(toReactionGroup)}
      isSent={isMine}
      onReact={onToggle}
      availableEmojis={EXTENDED_EMOJIS}
    />
  );
});

/** Wrapper team-chat de QuickReactionStrip. */
export const TeamQuickReactionBar = memo(function TeamQuickReactionBar({
  messageId,
  isMine,
  onToggle,
  reactions = [],
}: {
  messageId: string;
  isMine: boolean;
  onToggle: (emoji: string) => void;
  reactions?: AggregatedReaction[];
}) {
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
});
