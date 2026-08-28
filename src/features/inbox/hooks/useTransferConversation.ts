import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useTransferConversation');
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';

interface UseTransferConversationOptions {
  contactId: string;
  whatsappConnectionId: string | undefined;
}

export interface TransferConversationResult {
  status: 'success' | 'partial' | 'error';
  title: string;
  description: string;
}

/**
 * Hook that provides a real implementation for conversation transfer.
 *
 * Previously, `handleTransfer` in ChatPanel was a stub that only displayed
 * a success toast without performing any database update. This hook fixes
 * that critical gap by:
 *
 * 1. Updating `contacts.assigned_to` (agent transfer) or
 *    `contacts.queue_id` (queue transfer) in Supabase.
 * 2. Inserting a system message in the conversation timeline so the
 *    transfer is auditable.
 * 3. Providing proper error handling with user-facing feedback.
 */
export function useTransferConversation({
  contactId,
  whatsappConnectionId,
}: UseTransferConversationOptions) {
  const transferConversation = useCallback(
    async (type: 'agent' | 'queue', targetId: string, message?: string) => {
      if (!isValidUUID(contactId)) {
        log.warn('transferConversation: contactId is not a valid UUID, skipping', { contactId });
        return {
          status: 'error',
          title: 'Erro na transferência',
          description: 'Não foi possível transferir o chat porque o contato é inválido.',
        } satisfies TransferConversationResult;
      }
      let profileId: string;
      let profileName = 'Agente';
      let current: {
        assigned_to: string | null;
        queue_id: string | null;
        name: string | null;
        remote_jid: string | null;
        instance_name: string | null;
      };

      try {
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError || !userData.user?.id) throw authError ?? new Error('Agent unavailable');

        // auth.uid() identifica auth.users; as FKs de agente usam o UUID surrogate de
        // zapp.profiles. Eles não são iguais para todos os usuários do banco canônico.
        const { data: profile, error: profileError } = await dbFrom('profiles')
          .select('id, name')
          .eq('user_id', userData.user.id)
          .maybeSingle();
        if (profileError || !profile?.id) {
          throw profileError ?? new Error('Agent profile not visible');
        }
        profileId = profile.id;
        profileName = profile.name ?? 'Agente';

        // INBOX-12: ler a atribuição atual antes da transferência para compor o
        // audit trail em conversation_transfers (from_agent_id/from_queue_id).
        const { data, error: currentError } = await dbFrom('contacts')
          .select('assigned_to, queue_id, name, remote_jid, instance_name')
          .eq('id', contactId)
          .maybeSingle();
        if (currentError || !data) throw currentError ?? new Error('Contact not visible');
        current = data;
      } catch (err) {
        log.error('Transfer preflight failed:', err);
        return {
          status: 'error',
          title: 'Erro na transferência',
          description: 'Não foi possível transferir o chat. Tente novamente.',
        } satisfies TransferConversationResult;
      }

      const updateData: Record<string, string | null> = {};
      if (type === 'agent') {
        updateData.assigned_to = targetId;
      } else {
        updateData.queue_id = targetId;
        // Ao transferir para fila, soltar o agente para o roteador escolher o próximo.
        updateData.assigned_to = null;
      }

      try {
        let updateQuery = dbFrom('contacts').update(updateData).eq('id', contactId);

        // Compare-and-set mínimo: se outro agente reatribuiu o contato entre a leitura
        // e este UPDATE, a linha deixa de casar e não sobrescrevemos a ação concorrente.
        updateQuery = current.assigned_to
          ? updateQuery.eq('assigned_to', current.assigned_to)
          : updateQuery.is('assigned_to', null);
        updateQuery = current.queue_id
          ? updateQuery.eq('queue_id', current.queue_id)
          : updateQuery.is('queue_id', null);

        const { data: updatedContact, error: updateError } = await updateQuery
          .select('id')
          .maybeSingle();
        if (updateError || !updatedContact?.id) {
          throw updateError ?? new Error('Contact update affected zero rows');
        }
      } catch (err) {
        log.error('Transfer contact update failed:', err);
        return {
          status: 'error',
          title: 'Erro na transferência',
          description: 'Não foi possível transferir o chat. Tente novamente.',
        } satisfies TransferConversationResult;
      }

      // A partir daqui a atribuição principal já foi commitada. Toda falha posterior
      // é parcial: nunca instruir retry como se a transferência não tivesse ocorrido.
      const transferNote = message
        ? `🔄 Transferência: ${message}`
        : type === 'agent'
          ? '🔄 Chat transferido para outro atendente.'
          : '🔄 Chat transferido para outra fila.';

      let timelineErr: unknown = null;
      try {
        const { error } = await dbFrom('messages').insert({
          contact_id: contactId,
          whatsapp_connection_id: whatsappConnectionId ?? null,
          content: transferNote,
          message_type: 'text',
          sender: 'agent',
          status: 'sent',
          agent_id: profileId,
        });
        timelineErr = error;
      } catch (err) {
        timelineErr = err;
      }
      if (timelineErr) {
        log.error('messages insert failed during transfer audit trail:', timelineErr);
      }

      const now = new Date().toISOString();
      let transferRow: { id: string | null } | null = null;
      let transferErr: unknown = null;
      try {
        const result = await supabase
          .from('conversation_transfers')
          .insert({
            contact_id: contactId,
            contact_name: current.name,
            from_agent_id: current.assigned_to,
            from_queue_id: current.queue_id,
            to_agent_id: type === 'agent' ? targetId : null,
            to_queue_id: type === 'queue' ? targetId : null,
            transfer_type: 'internal',
            status: 'pending',
            priority: 2,
            reason:
              message ??
              (type === 'agent'
                ? 'Transferência para outro atendente'
                : 'Transferência para outra fila'),
            remote_jid: current.remote_jid ?? '',
            source_instance: current.instance_name ?? '',
            target_instance: current.instance_name ?? '',
            ticket_number: `T-${Date.now().toString(36).toUpperCase()}`,
            created_at: now,
            updated_at: now,
          })
          .select('id')
          .maybeSingle();
        transferRow = result.data;
        transferErr = result.error;
      } catch (err) {
        transferErr = err;
      }

      const transferLogged = !transferErr && Boolean(transferRow?.id);
      if (transferErr) {
        log.error('conversation_transfers insert failed:', transferErr);
      } else if (!transferRow?.id) {
        log.error('conversation_transfers insert returned no audit id');
      }

      let commentErr: unknown = null;
      if (message && transferRow?.id) {
        try {
          const { error } = await supabase.from('transfer_comments').insert({
            transfer_id: transferRow.id,
            agent_id: profileId,
            author_instance: current.instance_name ?? '',
            author_name: profileName,
            content: message,
          });
          commentErr = error;
        } catch (err) {
          commentErr = err;
        }
        if (commentErr) {
          log.error('transfer_comments insert failed:', commentErr);
        }
      }

      const successDescription =
        type === 'agent'
          ? 'O chat foi transferido para outro atendente.'
          : 'O chat foi transferido para outra fila.';

      if (timelineErr || !transferLogged || commentErr) {
        return {
          status: 'partial',
          title: 'Transferência parcial',
          description:
            'O chat foi transferido, mas a trilha de auditoria ficou incompleta. Revise o histórico antes de seguir.',
        } satisfies TransferConversationResult;
      }

      return {
        status: 'success',
        title: 'Chat transferido!',
        description: successDescription,
      } satisfies TransferConversationResult;
    },
    [contactId, whatsappConnectionId]
  );

  return { transferConversation };
}
