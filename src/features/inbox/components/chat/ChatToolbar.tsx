/**
 * P11 (E61) — ChatToolbar
 * Bloco extraído de ChatInputArea.tsx — barra de ferramentas secundária.
 * Encapsula SecondaryToolbar + tooltip de disabled + mobile quick tools.
 */
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from '@/components/ui/motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AIRewriteButton } from './AIRewriteButton';
import { RichTextToggle } from './RichTextToolbar';
import { SecondaryToolbar } from './ChatInputToolbars';
import { StickerPicker } from '../StickerPicker';
import { CustomEmojiPicker } from '../CustomEmojiPicker';
import type { FileUploaderRef } from '../FileUploader';
import type { Message } from '@/types/chat';

interface ChatToolbarProps {
  // Estado de envio
  isSending: boolean;
  editingMessage?: Message | null;
  isRecordingAudio: boolean;
  // Mobile
  isMobile: boolean;
  hasText: boolean;
  // Rich toolbar
  showRichToolbar: boolean;
  onToggleRichToolbar: () => void;
  // SecondaryToolbar forwarded props
  // Refs seguem o formato produzido por `useRef<T>(null)` — RefObject<T | null>.
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  /** Contrato real do StickerPicker: recebe a URL do sticker. */
  onSendSticker: (stickerUrl: string) => void;
  onSendAudioMeme: (url: string) => void;
  onSendCustomEmoji: (emojiUrl: string) => void;
  onOpenCatalog?: () => void;
  onAudioSend: (blob: Blob) => void;
  fileUploaderRef: React.RefObject<FileUploaderRef | null>;
  instanceName?: string;
  contactPhone: string;
  contactId: string;
  contactName: string;
  /** Ditado por voz devolve o texto transcrito. */
  onVoiceDictation: (text: string) => void;
  /** Contrato real do FileUploader: um arquivo por vez + categoria detectada. */
  onFileSelect: (file: File, category: string) => void;
  isWhisper?: boolean;
  onToggleWhisper?: () => void;
  // Mobile quick tools
  onRewrite: (text: string) => void;
}

export function ChatToolbar({
  isSending,
  editingMessage,
  isRecordingAudio,
  isMobile,
  hasText,
  showRichToolbar,
  onToggleRichToolbar,
  inputRef,
  inputValue,
  onSendSticker,
  onSendAudioMeme,
  onSendCustomEmoji,
  onOpenCatalog,
  onAudioSend,
  fileUploaderRef,
  instanceName,
  contactPhone,
  contactId,
  contactName,
  onVoiceDictation,
  onFileSelect,
  isWhisper,
  onToggleWhisper,
  onRewrite,
}: ChatToolbarProps) {
  const isDisabled = isSending || !!editingMessage || isRecordingAudio;

  return (
    <>
      {/* Secondary toolbar wrapper */}
      <div className={cn('mb-[3px] flex shrink-0 items-center self-end', isMobile && 'mb-0')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(isDisabled ? 'cursor-not-allowed' : '')}>
              <SecondaryToolbar
                inputRef={inputRef}
                inputValue={inputValue}
                showRichToolbar={showRichToolbar}
                onToggleRichToolbar={onToggleRichToolbar}
                isRecordingAudio={isRecordingAudio}
                onSendSticker={onSendSticker}
                onSendAudioMeme={onSendAudioMeme}
                onSendCustomEmoji={onSendCustomEmoji}
                onOpenCatalog={onOpenCatalog}
                onAudioSend={onAudioSend}
                fileUploaderRef={fileUploaderRef}
                instanceName={instanceName}
                contactPhone={contactPhone}
                contactId={contactId}
                contactName={contactName}
                onVoiceDictation={onVoiceDictation}
                onFileSelect={onFileSelect}
                isWhisper={isWhisper}
                onToggleWhisper={onToggleWhisper}
                disabled={isDisabled}
              />
            </div>
          </TooltipTrigger>
          {isDisabled && (
            <TooltipContent
              side="top"
              className="border-border bg-muted text-[10px] font-medium text-muted-foreground shadow-md"
            >
              {isSending
                ? 'Aguarde o envio concluir'
                : editingMessage
                  ? 'Finalize a edição para usar ferramentas'
                  : 'Finalize a gravação para usar ferramentas'}
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      {/* Mobile quick tools */}
      <AnimatePresence>
        {isMobile && hasText && (
          <motion.div
            key="mobile-quick-tools"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="scrollbar-none mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5"
          >
            <AIRewriteButton
              inputValue={inputValue}
              contactName={contactName}
              onRewrite={onRewrite}
            />
            <RichTextToggle active={showRichToolbar} onToggle={onToggleRichToolbar} />
            <CustomEmojiPicker onSendEmoji={onSendCustomEmoji} />
            <StickerPicker onSendSticker={onSendSticker} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
