import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { isRlsDeniedError, rlsDeniedMessage } from '@/lib/errors/rlsError';

interface Params {
  contactId: string;
  scheduleMessage: (args: {
    contactId: string;
    content: string;
    scheduledAt: Date;
    messageType: string;
    mediaUrl?: string;
  }) => Promise<unknown>;
  onDone: () => void;
}

export type ChatScheduleMessageResult = boolean;

function getSignedUrlFailureMessage(errorMessage?: string) {
  return errorMessage
    ? `Falha ao gerar link do anexo: ${errorMessage}`
    : 'Falha ao gerar link do anexo. Tente novamente.';
}

/**
 * Encapsulates the "schedule message" flow, including optional attachment
 * upload to the whatsapp-media bucket and signed-URL resolution.
 *
 * E39 (findings-04 A5): a signed URL do Supabase Storage expira em 7 dias
 * (TTL 604800s). Agendar mídia para MAIS de 7 dias cria uma URL quebrada na
 * hora da execução. Decisão registrada (E39.9): REJEITAR com erro claro —
 * não há maquinário de re-upload na execução, e "gerar signed URL curta +
 * re-upload" exigiria um job server-side inexistente.
 */
const MAX_MEDIA_SCHEDULE_MS = 7 * 24 * 60 * 60 * 1000; // TTL da signed URL (604800s)
const SCHEDULED_MEDIA_BUCKET = 'whatsapp-media';
const SIGNED_URL_TTL_SECONDS = 604800;

/**
 * A mídia só passa a ter dono depois que o agendamento é persistido. Se uma
 * etapa posterior falhar, tenta desfazer o upload sem ocultar o erro original
 * que o atendente precisa ver.
 */
async function removeOrphanedScheduledMedia(path: string): Promise<void> {
  try {
    const { error } = await supabase.storage.from(SCHEDULED_MEDIA_BUCKET).remove([path]);
    if (error) {
      log.warn('Falha ao remover mídia órfã de agendamento:', { path, error });
    }
  } catch (error) {
    log.warn('Falha ao remover mídia órfã de agendamento:', { path, error });
  }
}

export function useChatScheduleMessage({ contactId, scheduleMessage, onDone }: Params) {
  return useCallback(
    async (
      content: string,
      scheduledAt: Date,
      attachment?: File
    ): Promise<ChatScheduleMessageResult> => {
      let uploadedMediaPath: string | undefined;
      let scheduledMessagePersisted = false;

      try {
        // E39.9: bloqueio de agendamento inválido — mídia além do prazo da
        // signed URL. Valida ANTES do upload (não sobe arquivo à toa).
        if (attachment && scheduledAt.getTime() - Date.now() > MAX_MEDIA_SCHEDULE_MS) {
          toast({
            title: 'Prazo máximo de agendamento: 7 dias',
            description:
              'Anexos só podem ser agendados até 7 dias à frente (limite da URL assinada).',
            variant: 'destructive',
          });
          return false;
        }
        let mediaUrl: string | undefined;
        let messageType = 'text';
        if (attachment) {
          const fileName = `scheduled_${crypto.randomUUID()}_${attachment.name}`;
          const { error: uploadError } = await supabase.storage
            .from(SCHEDULED_MEDIA_BUCKET)
            .upload(fileName, attachment);
          if (uploadError) {
            toast({
              title: 'Erro no upload',
              description: `Falha ao anexar: ${uploadError.message}`,
              variant: 'destructive',
            });
            return false;
          } else {
            uploadedMediaPath = fileName;
            const { data: signedData, error: signedUrlError } = await supabase.storage
              .from(SCHEDULED_MEDIA_BUCKET)
              .createSignedUrl(fileName, SIGNED_URL_TTL_SECONDS);
            if (signedUrlError || !signedData?.signedUrl) {
              await removeOrphanedScheduledMedia(fileName);
              toast({
                title: 'Erro no upload',
                description: getSignedUrlFailureMessage(signedUrlError?.message),
                variant: 'destructive',
              });
              return false;
            }
            mediaUrl = signedData?.signedUrl;
            messageType = attachment.type.startsWith('audio')
              ? 'audio'
              : attachment.type.startsWith('image')
                ? 'image'
                : attachment.type.startsWith('video')
                  ? 'video'
                  : 'document';
          }
        }
        await scheduleMessage({ contactId, content, scheduledAt, messageType, mediaUrl });
        scheduledMessagePersisted = true;
        onDone();
        return true;
      } catch (err) {
        if (uploadedMediaPath && !scheduledMessagePersisted) {
          await removeOrphanedScheduledMedia(uploadedMediaPath);
        }
        log.error('Failed to schedule message:', err);
        // CAMPANHAS-09: toast REAL em 403 — nunca silenciar nem mascarar a causa.
        toast({
          title: 'Erro ao agendar mensagem',
          description: isRlsDeniedError(err)
            ? `${rlsDeniedMessage('mensagens agendadas')} Verifique se o contato está visível para você.`
            : 'Tente novamente.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [contactId, scheduleMessage, onDone]
  );
}
