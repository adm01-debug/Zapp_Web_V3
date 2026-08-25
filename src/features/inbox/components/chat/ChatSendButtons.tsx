/**
 * P12 (E61) — ChatSendButtons
 * Botões Send + Mic extraídos de ChatInputArea.tsx.
 * fix(audit): return statement ausente, Check não importado, onRecordToggle vs onToggleRecording
 */
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from '@/components/ui/motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Check, Send, Mic } from 'lucide-react';
import type { useChatInputLogic } from './useChatInputLogic';

interface ChatSendButtonsProps {
  logic: ReturnType<typeof useChatInputLogic>;
  isSending?: boolean;
  isRecordingAudio?: boolean;
  isV2AudioEnabled?: boolean;
  editingMessage?: import('@/types/chat').Message | null;
  onAudioSend?: (blob: Blob) => void;
  onAudioCancel?: () => void;
  onToggleRecording: () => void;
}

export function ChatSendButtons({
  logic,
  isSending,
  editingMessage,
  onToggleRecording,
  // Áudio futuro — presentes na interface mas não usados até E64 (v2_audio_recorder)
  isRecordingAudio: _isRecordingAudio,
  isV2AudioEnabled: _isV2AudioEnabled,
  onAudioSend: _onAudioSend,
  onAudioCancel: _onAudioCancel,
}: ChatSendButtonsProps): React.ReactElement | null {
  return (
    <div className="mb-[1px] flex shrink-0 items-center gap-2 self-end">
      {isSending && !logic.isMobile && (
        <motion.span
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground"
        >
          Enviando...
        </motion.span>
      )}
      {/* SEND */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={() => logic.handleSendWithAnimation()}
            disabled={isSending}
            whileHover={!isSending ? { scale: 1.1 } : {}}
            whileTap={!isSending ? { scale: 0.9 } : {}}
            className={cn(
              'inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              logic.canSend
                ? 'bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.55),0_0_36px_hsl(var(--primary)/0.35)] ring-2 ring-primary/40 hover:shadow-[0_0_24px_hsl(var(--primary)/0.7),0_0_48px_hsl(var(--primary)/0.45)]'
                : 'cursor-not-allowed bg-muted text-muted-foreground opacity-50 hover:bg-muted/80',
              logic.isMobile ? 'h-11 w-11' : 'h-[46px] w-[46px]'
            )}
            aria-label={isSending ? 'Enviando mensagem...' : 'Enviar mensagem'}
            aria-disabled={isSending || !logic.canSend}
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
              ) : editingMessage ? (
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
            ? '🚀 Mensagem sendo processada...'
            : logic.isOverLimit
              ? '⚠️ Limite de caracteres excedido'
              : !logic.canSend
                ? '📎 Clique para anexar arquivo'
                : editingMessage
                  ? '✅ Confirmar alterações'
                  : '🚀 Enviar mensagem (Enter)'}
        </TooltipContent>
      </Tooltip>

      {/* MIC */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={onToggleRecording}
            disabled={isSending || logic.canSend}
            whileHover={!(isSending || logic.canSend) ? { scale: 1.1 } : {}}
            whileTap={!(isSending || logic.canSend) ? { scale: 0.9 } : {}}
            className={cn(
              'inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2',
              logic.isMicActive
                ? 'z-10 scale-110 bg-destructive text-foreground shadow-[0_0_24px_rgba(244,63,94,0.7),0_0_48px_rgba(244,63,94,0.45)] ring-2 ring-rose-400/60 hover:bg-destructive'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
              !logic.isMicActive && (isSending || logic.canSend) && 'cursor-not-allowed opacity-50',
              logic.isMobile ? 'h-11 w-11' : 'h-[46px] w-[46px]'
            )}
            aria-label={logic.isMicActive ? 'Parar gravação' : 'Gravar áudio'}
            aria-disabled={isSending || logic.canSend}
            aria-pressed={logic.isMicActive}
          >
            <Mic className={cn('h-6 w-6', logic.isMicActive && 'animate-pulse')} />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[200px] rounded-lg border-none bg-destructive px-3 py-1.5 text-[10px] font-medium text-foreground shadow-xl"
        >
          {logic.isMicActive
            ? '🔴 Gravando... Clique para parar'
            : logic.canSend
              ? '🚫 Limpe o texto para gravar áudio'
              : isSending
                ? '⏳ Aguarde o envio para gravar'
                : '🎤 Gravar áudio (Segure ou clique)'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
