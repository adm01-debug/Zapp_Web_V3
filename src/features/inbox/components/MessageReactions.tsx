/**
 * @file MessageReactions.tsx (inbox)
 * @description Wrappers inbox sobre os componentes canônicos de
 * src/components/ui/message-reactions.tsx — E58.
 * A lógica de negócio (useMessageReactions, useReactionMutations) fica aqui.
 */
import { memo, useMemo, useCallback } from 'react';
import {
  MessageReactionBar,
  QuickReactionStrip,
  WHATSAPP_EMOJIS,
  EXTENDED_EMOJIS,
} from '@/components/ui/message-reactions';
import { useMessageReactions } from '../hooks/useMessageReactions';

/** Configuração de emojis do WhatsApp expostos pelo inbox */
export { WHATSAPP_EMOJIS as WHATSAPP_REACTIONS, EXTENDED_EMOJIS };

interface MessageReactionsProps {
  messageId: string;
  isSent?: boolean;
  showExtended?: boolean;
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
  refreshKey?: string;
  disableRealtime?: boolean;
}

/** Wrapper inbox: busca reactions via hook e usa MessageReactionBar canônico. */
export const MessageReactions = memo(function MessageReactions({
  messageId,
  isSent,
  showExtended = false,
  instanceName,
  contactJid,
  externalId,
  senderType,
  refreshKey,
  disableRealtime,
}: MessageReactionsProps) {
  const reactionState = useMessageReactions(messageId, {
    instanceName,
    contactJid,
    externalId,
    senderType,
    refreshKey,
    disableRealtime,
  });
  const { reactions, addReaction, removeReaction, currentProfileId } = reactionState;
  // addReaction/removeReaction já registram sucesso/erro no mutation owner.
  // O wrapper apenas delega para evitar analytics/audit_logs duplicados.

  /** Adapta MessageReaction[] → ReactionGroup[] canônico */
  const reactionGroups = useMemo(() => {
    const map = new Map<string, { count: number; users: string[]; reactedByMe: boolean }>();
    for (const r of reactions) {
      if (!map.has(r.emoji)) {
        map.set(r.emoji, { count: 0, users: [], reactedByMe: false });
      }
      const g = map.get(r.emoji);
      if (!g) continue;
      g.count++;
      g.users.push(r.user_name || 'Usuário');
      if (r.user_id === currentProfileId) g.reactedByMe = true;
    }
    return Array.from(map.entries())
      .map(([emoji, g]) => ({ emoji, ...g }))
      .sort((a, b) => b.count - a.count);
  }, [reactions, currentProfileId]);

  const handleReact = useCallback(
    async (emoji: string) => {
      const group = reactionGroups.find((g) => g.emoji === emoji);
      if (group?.reactedByMe) await removeReaction(emoji);
      else await addReaction(emoji);
    },
    [reactionGroups, addReaction, removeReaction]
  );

  return (
    <MessageReactionBar
      messageId={messageId}
      reactions={reactionGroups}
      isSent={isSent}
      onReact={handleReact}
      availableEmojis={showExtended ? EXTENDED_EMOJIS : WHATSAPP_EMOJIS}
      showUserTooltips
    />
  );
});

interface QuickReactionBarProps extends MessageReactionsProps {
  forceShow?: boolean;
}

/** Wrapper inbox: strip rápida usando QuickReactionStrip canônico. */
export const QuickReactionBar = memo(function QuickReactionBar({
  messageId,
  isSent,
  instanceName,
  contactJid,
  externalId,
  senderType,
  refreshKey,
  disableRealtime,
  forceShow,
}: QuickReactionBarProps) {
  const reactionState = useMessageReactions(messageId, {
    instanceName,
    contactJid,
    externalId,
    senderType,
    refreshKey,
    disableRealtime,
  });
  const { addReaction, removeReaction, hasReacted } = reactionState;

  const handleReact = useCallback(
    async (emoji: string) => {
      if (hasReacted(emoji)) await removeReaction(emoji);
      else await addReaction(emoji);
    },
    [hasReacted, addReaction, removeReaction]
  );

  return (
    <QuickReactionStrip
      messageId={messageId}
      isSent={isSent}
      onReact={handleReact}
      hasReacted={hasReacted}
      forceShow={forceShow}
    />
  );
});
