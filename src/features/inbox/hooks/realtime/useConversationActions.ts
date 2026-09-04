import { useCallback, useEffect, useRef } from 'react';
import { dbFrom } from '@/integrations/datasource/db';
import { getLogger } from '@/lib/logger';
import { sendMessageToContact } from './messageSender';
import { isValidUUID } from '@/utils/uuid';
import { touchLastSeen } from '../../services/touchLastSeen';
import type { ConversationWithMessages } from './types';
import { isTransientMarkReadError, persistMessagesRead } from '../../services/markMessagesRead';

const log = getLogger('ConversationActions');

type CommitFn = (
  updater:
    ConversationWithMessages[] | ((prev: ConversationWithMessages[]) => ConversationWithMessages[])
) => void;

interface UseConversationActionsOptions {
  commitConversations: CommitFn;
}

/** Provides sendMessage and markAsRead actions that write through to Supabase and optimistically update the local conversation list. */
export function useConversationActions({ commitConversations }: UseConversationActionsOptions) {
  // ── Batch markAsRead (2026-08-03) ────────────────────────────────────────
  // Mesmo padrão do useRealtimeMessages: chamadas individuais são coalescidas
  // e descarregadas em UM PATCH .in('contact_id', ids). O update otimista
  // (commitConversations) permanece imediato por chamada.
  const MARK_READ_FLUSH_MS = 250;
  const MARK_READ_RETRY_BASE_MS = 1_000;
  const MARK_READ_MAX_RETRIES = 3;
  const pendingMarkReadRef = useRef<Set<string>>(new Set());
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadRetryCountRef = useRef(0);
  const markReadUnmountingRef = useRef(false);
  const flushMarkAsReadRef = useRef<(allowRetry?: boolean) => Promise<void>>(async () => {});

  const scheduleMarkAsReadFlush = useCallback((delayMs = MARK_READ_FLUSH_MS) => {
    if (markReadTimerRef.current !== null) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null;
      void flushMarkAsReadRef.current(true);
    }, delayMs);
  }, []);

  const flushMarkAsRead = useCallback(
    async (allowRetry = true) => {
      if (markReadTimerRef.current !== null) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
      const ids = Array.from(pendingMarkReadRef.current);
      pendingMarkReadRef.current = new Set();
      if (ids.length === 0) return;

      let error: unknown = null;
      try {
        ({ error } = await persistMessagesRead(ids));
      } catch (err) {
        error = err;
      }
      if (error) {
        const shouldRetry = isTransientMarkReadError(error);
        if (shouldRetry) {
          for (const id of ids) pendingMarkReadRef.current.add(id);
          markReadRetryCountRef.current += 1;
        } else {
          markReadRetryCountRef.current = 0;
        }
        log.error(
          shouldRetry
            ? 'Error marking messages as read (batch); ids mantidos para retry:'
            : 'Error marking messages as read (batch) is permanent; retry descartado:',
          error
        );
        if (
          shouldRetry &&
          allowRetry &&
          !markReadUnmountingRef.current &&
          markReadRetryCountRef.current <= MARK_READ_MAX_RETRIES
        ) {
          scheduleMarkAsReadFlush(
            MARK_READ_RETRY_BASE_MS * 2 ** (markReadRetryCountRef.current - 1)
          );
        }
        return;
      }
      markReadRetryCountRef.current = 0;

      // Touch last_seen throttled global (máx. 1 PATCH a cada 2min, deduplicado entre instâncias)
      touchLastSeen();
    },
    [scheduleMarkAsReadFlush]
  );

  flushMarkAsReadRef.current = flushMarkAsRead;

  const applyOptimisticRead = useCallback(
    (contactIds: string[]) => {
      const idSet = new Set(contactIds);
      commitConversations((prev) =>
        prev.map((c) =>
          idSet.has(c.contact.id)
            ? { ...c, messages: c.messages.map((m) => ({ ...m, is_read: true })), unreadCount: 0 }
            : c
        )
      );
    },
    [commitConversations]
  );

  const markAsRead = useCallback(
    async (contactId: string) => {
      if (!isValidUUID(contactId)) {
        log.warn(
          '[markAsRead] contactId is not a valid UUID — skipping to prevent 400 (likely a WhatsApp JID)',
          { contactId }
        );
        return;
      }

      // Otimista imediato (mesma UX de antes, sem esperar o PATCH)
      applyOptimisticRead([contactId]);
      // PATCH coalescido: rajadas de seleção viram 1 chamada .in()
      pendingMarkReadRef.current.add(contactId);
      scheduleMarkAsReadFlush();
    },
    [applyOptimisticRead, scheduleMarkAsReadFlush]
  );

  /** Marca várias conversas como lidas em UM PATCH batch (.in('contact_id', ids)). */
  const markManyAsRead = useCallback(
    (contactIds: string[]) => {
      const validIds = contactIds.filter(isValidUUID);
      if (validIds.length === 0) return;
      applyOptimisticRead(validIds);
      for (const id of validIds) pendingMarkReadRef.current.add(id);
      scheduleMarkAsReadFlush();
    },
    [applyOptimisticRead, scheduleMarkAsReadFlush]
  );

  // Flush pendente no unmount (fire-and-forget) — evita perder writes quando
  // o usuário navega antes do debounce disparar.
  useEffect(() => {
    markReadUnmountingRef.current = false;
    return () => {
      markReadUnmountingRef.current = true;
      if (markReadTimerRef.current !== null) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
      void flushMarkAsRead(false);
    };
  }, [flushMarkAsRead]);
  const sendMessage = async (
    contactId: string,
    content: string,
    messageType: string = 'text',
    mediaUrl?: string,
    mediaPayload?: string
  ) => {
    if (!isValidUUID(contactId)) {
      log.warn('[sendMessage] contactId is not a valid UUID — skipping', { contactId });
      return null;
    }

    const response = await sendMessageToContact(
      contactId,
      content,
      messageType,
      mediaUrl,
      mediaPayload
    );

    try {
      const { data: conv, error: convSelErr } = await dbFrom('team_conversations')
        .select('id, routing_status')
        .eq('id', contactId)
        .maybeSingle();
      if (convSelErr) throw convSelErr;

      if (conv && conv.routing_status === 'pending') {
        const { error: routingErr } = await dbFrom('team_conversations')
          .update({ routing_status: 'assigned' })
          .eq('id', contactId);
        if (routingErr) throw routingErr;
      }
    } catch (err) {
      log.error('Error checking routing status on send:', err);
    }

    return response;
  };

  return { sendMessage, markAsRead, markManyAsRead };
}
