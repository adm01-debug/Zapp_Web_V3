import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { insertContactNote } from '../hooks/useContactNotesMutations';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ViewersIndicator } from './collaboration/ViewersIndicator';
import { InternalNotesPanel } from './collaboration/InternalNotesPanel';
import { HandoffDialog, type HandoffResult } from './collaboration/HandoffDialog';
import { dbFrom } from '@/integrations/datasource/db';
import { queryKeys } from '@/services/api/queryKeys';
import { isValidUUID } from '@/utils/uuid';
import { getLogger } from '@/lib/logger';

const log = getLogger('RealtimeCollaboration');

interface RealtimeCollaborationProps {
  contactId: string;
  className?: string;
}

/** Realtime Collaboration component. */
export function RealtimeCollaboration({ contactId, className }: RealtimeCollaborationProps) {
  const [handoffOpen, setHandoffOpen] = useState(false);
  const queryClient = useQueryClient();

  // E71/plano-canônico 041: antes deste fix, ID inválido, erro de RLS e
  // zero-row eram engolidos silenciosamente (return sem throw) — o diálogo
  // sempre mostrava "transferido com sucesso" mesmo sem nenhuma escrita real.
  // Agora rejeita (o diálogo permanece aberto) e distingue sucesso parcial
  // quando só a nota interna falha (a atribuição em si já foi commitada).
  const handleHandoff = async (agentId: string, comment: string): Promise<HandoffResult> => {
    if (!isValidUUID(contactId)) {
      throw new Error('ID de contato inválido para transferência.');
    }

    const { data: updatedContact, error: updateError } = await dbFrom('contacts')
      .update({ assigned_to: agentId })
      .eq('id', contactId)
      .select('id')
      .maybeSingle();
    if (updateError || !updatedContact?.id) {
      throw (
        updateError ??
        new Error('Nenhuma conversa foi atualizada — permissão negada ou contato inexistente.')
      );
    }

    let noteSaved = true;
    if (comment) {
      const { error: noteError } = await insertContactNote({
        contact_id: contactId,
        content: `Transferido: ${comment}`,
      });
      if (noteError) {
        log.warn('[RealtimeCollaboration] Nota de handoff não pôde ser salva:', noteError);
        noteSaved = false;
      } else {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.internalNotes.contact(contactId),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.notes(contactId) });
      }
    }
    return { noteSaved };
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <ViewersIndicator contactId={contactId} />
        <Button variant="outline" size="sm" onClick={() => setHandoffOpen(true)}>
          <Users className="mr-2 h-4 w-4" />
          Transferir
        </Button>
      </div>
      <InternalNotesPanel contactId={contactId} />
      <HandoffDialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        contactId={contactId}
        onHandoff={handleHandoff}
      />
    </div>
  );
}

/** Re-exported module members. */
export { ViewersIndicator, InternalNotesPanel, HandoffDialog };
