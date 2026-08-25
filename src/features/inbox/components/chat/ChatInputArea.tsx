import { useMemo, useEffect, useRef, memo } from 'react';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AnimatePresence, motion } from '@/components/ui/motion';
import { RichTextToolbar } from './RichTextToolbar';
import { AIRewriteButton } from './AIRewriteButton';
import { MentionAutocomplete, useMentions } from './MentionAutocomplete';
import { MarkdownPreview } from './MarkdownPreview';
import { SlashCommands, SlashCommand } from '../SlashCommands';
import { AudioRecorder } from '../AudioRecorder';
import { FileUploaderRef } from '../FileUploader';
import { ExternalProduct } from '@/hooks/useExternalApiManagement';
import type { QueueItem } from '../../hooks/useMessageQueue';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SecondaryToolbar, TertiaryToolsMenu } from './ChatInputToolbars';
import { StickerPicker } from '../StickerPicker';
import { CustomEmojiPicker } from '../CustomEmojiPicker';
import { RichTextToggle } from './RichTextToolbar';
import {
  Send,
  Mic,
  Plus,
  Loader2,
  X,
  Image as ImageIcon,
  FileVideo,
  FileAudio,
  Clock,
} from 'lucide-react';
import { InputPreviewBars } from './InputPreviewBars';
import { ChatSendProgress } from './ChatSendProgress';
import { getQueueLength, normalizeAttempts, getLastAttemptDuration } from './chatInputGuards';
import { ChatInputQueueDisplay } from './ChatInputQueueDisplay';
import { ChatToolbar } from './ChatToolbar';
import { ChatAttachmentPreview } from './ChatAttachmentPreview';
import { ChatQueueProgress } from './ChatQueueProgress';
import { ChatTextarea } from './ChatTextarea';
import { ChatSendButtons } from './ChatSendButtons';
import { useChatInputLogic, setNativeValue } from './useChatInputLogic';
import { playNotificationSound } from '@/utils/notificationSounds';
import { formatFileSize } from '@/utils/whatsappFileTypes';
import { asRef } from '@/lib/reactRefs';

function getQueueErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Erro desconhecido no envio.';
}

interface QuickReplyItem {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

interface ChatInputAreaProps {
  inputValue: string;
  replyToMessage: Message | null;
  editingMessage?: Message | null;
  isRecordingAudio: boolean;
  showSlashCommands: boolean;
  contactId: string;
  contactPhone: string;
  contactName: string;
  instanceName?: string;
  onPollSent?: (poll: { name: string; options: string[]; selectableCount: number }) => void;
  onContactSent?: (contactName: string) => void;
  messages: Message[];
  quickReplies: QuickReplyItem[];
  isSending?: boolean;
  sendProgress?: number;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBlur: () => void;
  onSend: (attachments?: File[]) => void;
  onCancelReply: () => void;
  onCancelEdit?: () => void;
  onEditStart?: (message: Message) => void;
  onSlashCommand: (command: SlashCommand, subCommand?: string) => void;
  onCloseSlashCommands: () => void;
  onQuickReply: (reply: QuickReplyItem) => void;
  onRecordToggle: () => void;
  onAudioSend: (blob: Blob) => void;
  onAudioCancel: () => void;
  onOpenInteractiveBuilder: () => void;
  onOpenSchedule: () => void;
  onOpenLocationPicker: () => void;
  onSendProduct: (product: ExternalProduct) => void;
  onSendSticker: (stickerUrl: string) => void;
  onSendAudioMeme: (audioUrl: string) => void;
  onSendCustomEmoji: (emojiUrl: string) => void;
  onOpenCatalog?: () => void;
  onSelectSuggestion: (text: string) => void;
  onSelectTemplate: (text: string) => void;
  onExternalFiles?: (files: File[]) => void;
  onPasteFiles?: (files: File[]) => void;
  signatureEnabled?: boolean;
  signatureName?: string;
  onToggleSignature?: () => void;
  isWhisper?: boolean;
  onToggleWhisper?: () => void;
  fileUploaderRef: React.RefObject<FileUploaderRef | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onOpenTeamFiles?: () => void;
  queue?: QueueItem[];
  onRetry?: (id: string) => void;
  onRemoveFromQueue?: (id: string) => void;
}

/** Chat Input Area component for the chat section. */
function ChatInputAreaInner(props: ChatInputAreaProps) {
  const {
    inputValue,
    replyToMessage,
    editingMessage,
    isRecordingAudio,
    showSlashCommands,
    contactId,
    contactPhone,
    contactName,
    instanceName,
    onPollSent,
    onContactSent,
    messages,
    quickReplies,
    isSending = false,
    sendProgress = 0,
    onInputChange,
    onKeyDown,
    onBlur,
    onSend,
    onCancelReply,
    onCancelEdit,
    onSlashCommand,
    onCloseSlashCommands,
    onQuickReply,
    onRecordToggle,
    onAudioSend,
    onAudioCancel,
    onOpenInteractiveBuilder,
    onOpenSchedule,
    onOpenLocationPicker,
    onSendProduct,
    onSendSticker,
    onSendAudioMeme,
    onSendCustomEmoji,
    onOpenCatalog,
    onSelectSuggestion,
    onSelectTemplate,
    onPasteFiles,
    signatureEnabled,
    signatureName,
    onToggleSignature,
    isWhisper,
    onToggleWhisper,
    fileUploaderRef,
    inputRef,
    onOpenTeamFiles,
    queue: _queue,
  } = props;

  const prevRecordingRef = useRef(isRecordingAudio);

  useEffect(() => {
    if (isRecordingAudio && !prevRecordingRef.current) {
      playNotificationSound('record_start', 'soft');
    } else if (!isRecordingAudio && prevRecordingRef.current) {
      playNotificationSound('record_stop', 'soft');
    }
    prevRecordingRef.current = isRecordingAudio;
  }, [isRecordingAudio]);

  const logic = useChatInputLogic({
    inputValue,
    contactId,
    editingMessage,
    inputRef,
    fileUploaderRef,
    onSend,
    onPasteFiles,
    isRecordingAudio,
  });

  const isV2AudioEnabled = isFeatureEnabled('v2_audio_recorder');
  const isRetryEnabled = isFeatureEnabled('message_queue_retry');

  const {
    isOpen: mentionOpen,
    cursorPos: mentionCursorPos,
    checkForMention,
    handleSelect: handleMentionSelect,
    close: closeMention,
  } = useMentions(inputRef);

  const tertiaryTools = useMemo(
    () => (
      <TertiaryToolsMenu
        instanceName={instanceName}
        contactPhone={contactPhone}
        contactName={contactName}
        messages={messages}
        quickReplies={quickReplies}
        onOpenInteractiveBuilder={onOpenInteractiveBuilder}
        onOpenLocationPicker={onOpenLocationPicker}
        onOpenSchedule={onOpenSchedule}
        onSendProduct={onSendProduct}
        onSelectSuggestion={onSelectSuggestion}
        onSelectTemplate={onSelectTemplate}
        onQuickReply={onQuickReply}
        signatureEnabled={signatureEnabled}
        signatureName={signatureName}
        onToggleSignature={onToggleSignature}
        onPollSent={onPollSent}
        onContactSent={onContactSent}
        onOpenTeamFiles={onOpenTeamFiles}
      />
    ),
    [
      instanceName,
      contactPhone,
      contactName,
      messages,
      quickReplies,
      onOpenInteractiveBuilder,
      onOpenLocationPicker,
      onOpenSchedule,
      onSendProduct,
      onSelectSuggestion,
      onSelectTemplate,
      onQuickReply,
      signatureEnabled,
      signatureName,
      onToggleSignature,
      onPollSent,
      onContactSent,
      onOpenTeamFiles,
    ]
  );

  const typingNotification = useMemo(() => {
    if (isWhisper) return 'Modo Sussurro: Notas internas invisíveis ao cliente';
    return null;
  }, [isWhisper]);

  return (
    <>
      <RichTextToolbar
        inputRef={inputRef}
        inputValue={inputValue}
        onInputChange={(val) => setNativeValue(inputRef, val)}
        visible={logic.showRichToolbar}
        onToggle={() => logic.setShowRichToolbar(!logic.showRichToolbar)}
      />

      <InputPreviewBars
        replyToMessage={replyToMessage}
        editingMessage={editingMessage}
        onCancelReply={onCancelReply}
        onCancelEdit={onCancelEdit}
      />
      {/* P12 (E61): extraído para ChatAttachmentPreview */}
      <ChatAttachmentPreview attachments={logic.attachments} onRemove={logic.removeAttachment} />
      {/* P12 (E61): progresso individual por item de fila */}
      <ChatQueueProgress
        queue={props.queue}
        isSending={isSending}
        onRetry={props.onRetry}
        onRemoveFromQueue={props.onRemoveFromQueue}
      />
      {/* Barra de progresso do contrato onProgress (sendProgress): visível apenas
          enquanto envia e a fila está vazia, para não duplicar com a barra de fila acima. */}
      <AnimatePresence>
        {isSending && sendProgress > 0 && getQueueLength(props.queue) === 0 && (
          <ChatSendProgress key="send-progress" isSending={isSending} sendProgress={sendProgress} />
        )}
      </AnimatePresence>
      <div
        className={cn(
          'relative flex shrink-0 flex-col gap-3 border-t border-border/10 bg-background/95 px-4 py-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] backdrop-blur-3xl transition-all duration-500 @container md:px-10 md:py-6',
          isWhisper && 'border-t-2 border-warning bg-warning/10 shadow-warning/10',
          logic.isMobile && 'safe-area-bottom px-3 py-4 pb-8'
        )}
        role="form"
        aria-label="Área de composição de mensagem"
      >
        <AnimatePresence>
          {isRecordingAudio && isV2AudioEnabled && (
            <motion.div
              key="audio-recorder"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 shadow-lg shadow-rose-500/5 backdrop-blur-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-destructive shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                  <span className="text-xs font-bold uppercase tracking-widest text-destructive">
                    Gravando Áudio
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5">
                  <span className="text-[10px] font-bold text-destructive">AO VIVO</span>
                </div>
              </div>
              <AudioRecorder onSend={onAudioSend} onCancel={onAudioCancel} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* P10 (E61): extraído para ChatInputQueueDisplay */}
        <ChatInputQueueDisplay queue={props.queue ?? []} isRetryEnabled={isRetryEnabled} />

        <SlashCommands
          inputValue={inputValue}
          onSelectCommand={onSlashCommand}
          onClose={onCloseSlashCommands}
          isOpen={showSlashCommands}
        />

        {typingNotification && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute -top-10 left-8 z-50 flex items-center gap-2"
          >
            <div className="h-2 w-2 animate-pulse rounded-full bg-warning shadow-[0_0_12px_rgba(245,158,11,0.8)]" />
            <span className="rounded-2xl border border-warning/40 bg-background/90 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-warning-foreground shadow-xl backdrop-blur-md dark:bg-warning/80 dark:text-warning-foreground">
              {typingNotification}
            </span>
          </motion.div>
        )}

        <div className="flex flex-col gap-2" role="toolbar" aria-label="Barra de mensagem">
          {/* SINGLE ROW: [+] [textarea] [secondary tools] [mic] [send] */}
          <div className="flex w-full items-end gap-1.5">
            {/* "+" Button (first) */}
            <Popover>
              <PopoverTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center self-end rounded-full text-[hsl(var(--muted-foreground))] outline-none transition-all hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-primary',
                    logic.isMobile ? 'mb-0.5 h-11 w-11' : 'mb-[3px] h-[42px] w-[42px]'
                  )}
                  aria-label="Mais opções de mensagem"
                >
                  <Plus className="h-6 w-6" />
                </motion.button>
              </PopoverTrigger>
              <PopoverContent
                className="w-60 border-border/40 bg-popover/95 p-2 shadow-2xl backdrop-blur-md duration-300 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2"
                align="start"
                side="top"
              >
                {tertiaryTools}
              </PopoverContent>
            </Popover>

            {/* P12 (E61): extraído para ChatTextarea */}
            <ChatTextarea
              logic={logic}
              inputRef={inputRef}
              inputValue={inputValue}
              inputId={undefined}
              isSending={isSending}
              isWhisper={isWhisper}
              replyToMessage={replyToMessage}
              editingMessage={editingMessage}
              messages={messages}
              onInputChange={onInputChange}
              onKeyDown={onKeyDown}
              onEditStart={props.onEditStart}
            />
            {/* P12 (E61): extraído para ChatSendButtons */}
            <ChatSendButtons
              logic={logic}
              isSending={isSending}
              isRecordingAudio={isRecordingAudio}
              isV2AudioEnabled={isV2AudioEnabled}
              editingMessage={editingMessage}
              onAudioSend={onAudioSend}
              onAudioCancel={onAudioCancel}
              onToggleRecording={() => {}}
            />
            {/* P11 (E61): extraído para ChatToolbar */}
            <ChatToolbar
              isSending={isSending ?? false}
              editingMessage={editingMessage}
              isRecordingAudio={isRecordingAudio}
              isMobile={logic.isMobile}
              hasText={logic.hasText}
              showRichToolbar={logic.showRichToolbar}
              onToggleRichToolbar={() => logic.setShowRichToolbar(!logic.showRichToolbar)}
              inputRef={inputRef}
              inputValue={inputValue}
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
              onVoiceDictation={logic.handleVoiceDictation}
              onFileSelect={logic.handleFileSelect}
              isWhisper={isWhisper}
              onToggleWhisper={onToggleWhisper}
              onRewrite={(newText) => setNativeValue(inputRef, newText)}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export const ChatInputArea = memo(ChatInputAreaInner);
