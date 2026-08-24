import { useRef, useState, useCallback, useEffect } from 'react';
import { ComposerCore } from '@/features/composer';
import { useTeamChatDraft } from '@/hooks/useTeamChatDraft';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from '@/components/ui/motion';
import { RichTextToolbar, RichTextToggle } from '@/features/inbox';
import { AIRewriteButton } from '@/features/inbox';
import { TextToAudioButton } from '@/features/inbox';
import { MentionAutocomplete, useMentions } from '@/features/inbox';
import { MarkdownPreview } from '@/features/inbox';
import { StickerPicker } from '@/features/inbox';
import { AudioMemePicker } from '@/features/inbox';
import { VoiceChangerPicker } from '@/features/inbox';
import { CustomEmojiPicker } from '@/features/inbox';
import { AudioRecorder } from '@/features/inbox';
import { VoiceDictationButton } from '@/components/mobile/VoiceDictationButton';
import { TeamFileUploader } from './TeamFileUploader';
import { useIsMobile } from '@/hooks/use-mobile';
import { TeamMessage } from '@/hooks/useTeamChat';
import { Send, Mic, Reply, X, Loader2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TeamChatInputAreaProps {
  conversationId: string;
  text: string;
  setText: (text: string) => void;
  replyTo: TeamMessage | null;
  isRecordingAudio: boolean;
  isPending: boolean;
  onSend: () => void;
  onCancelReply: () => void;
  onRecordToggle: () => void;
  onAudioSend: (blob: Blob) => void;
  onSendSticker: (url: string) => void;
  onSendAudioMeme: (url: string) => void;
  onSendCustomEmoji: (url: string) => void;
  onFileSent: (mediaUrl: string, mediaType: string, fileName: string) => void;
}

/** Team Chat Input Area component for the team chat section. */
export function TeamChatInputArea({
  conversationId,
  text,
  setText,
  replyTo,
  isRecordingAudio,
  isPending,
  onSend,
  onCancelReply,
  onRecordToggle,
  onAudioSend,
  onSendSticker,
  onSendAudioMeme,
  onSendCustomEmoji,
  onFileSent,
}: TeamChatInputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRichToolbar, setShowRichToolbar] = useState(false);
  const [showMarkdownPreview, _setShowMarkdownPreview] = useState(false);
  const [sendAnimation, setSendAnimation] = useState(false);
  const isMobile = useIsMobile();

  const draft = useTeamChatDraft({ conversationId, text, setText, onFileSent });
  const { hasText: draftHasText, isOverLimit: draftIsOverLimit, clearDraft } = draft;
  const {
    isOpen: mentionOpen,
    cursorPos: mentionCursorPos,
    checkForMention,
    handleSelect: handleMentionSelect,
    close: closeMention,
  } = useMentions(textareaRef);

  useEffect(
    () => () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    },
    []
  );

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendWithAnimation();
    }
  };

  const handleSendWithAnimation = useCallback(() => {
    if (!draftHasText || draftIsOverLimit || isPending) return;
    setSendAnimation(true);
    clearDraft();
    if (isMobile && navigator.vibrate) navigator.vibrate(50);
    onSend();
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setSendAnimation(false), 400);
  }, [draftHasText, draftIsOverLimit, isPending, isMobile, onSend, clearDraft]);

  const handleVoiceDictation = useCallback(
    (transcript: string) => {
      setText(text ? `${text} ${transcript}` : transcript);
      textareaRef.current?.focus();
    },
    [text, setText]
  );

  const secondaryTools = (
    <>
      <AIRewriteButton inputValue={text} onRewrite={(newText) => setText(newText)} />
      <StickerPicker onSendSticker={onSendSticker} />
      <AudioMemePicker onSendAudioMeme={(meme) => onSendAudioMeme(meme.audio_url)} />
      <VoiceChangerPicker onSendAudio={(url) => onSendAudioMeme(url)} />
      <CustomEmojiPicker onSendEmoji={onSendCustomEmoji} />
      <RichTextToggle
        active={showRichToolbar}
        onToggle={() => setShowRichToolbar(!showRichToolbar)}
      />
      <VoiceDictationButton onTranscript={handleVoiceDictation} disabled={isRecordingAudio} />
    </>
  );

  return (
    <>
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border bg-card px-3 pt-2"
          >
            <div className="flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted/50 p-2">
              <Reply className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-primary">
                  {replyTo.sender?.name || 'Você'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {replyTo.content || 'Mídia'}
                </p>
              </div>
              <Button
                aria-label="Cancelar resposta"
                size="icon"
                variant="ghost"
                className="h-5 w-5 shrink-0"
                onClick={onCancelReply}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RichTextToolbar
        inputRef={textareaRef}
        inputValue={text}
        onInputChange={setText}
        visible={showRichToolbar}
        onToggle={() => setShowRichToolbar(!showRichToolbar)}
      />

      <AnimatePresence>
        {isRecordingAudio && (
          <div className="mb-3 border-t border-border bg-card px-4 pt-3">
            <AudioRecorder onSend={onAudioSend} onCancel={() => onRecordToggle()} />
          </div>
        )}
      </AnimatePresence>
      <ComposerCore
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          checkForMention(e.target.value, e.target.selectionStart ?? 0);
        }}
        onSend={handleSendWithAnimation}
        onRecordToggle={onRecordToggle}
        isSending={isPending}
        canSend={draftHasText && !draftIsOverLimit}
        isMicActive={isRecordingAudio}
        isRecordingAudio={isRecordingAudio}
        isMobile={isMobile}
        charCount={draft.charCount}
        charLimit={draft.CHAR_LIMIT}
        isOverLimit={draftIsOverLimit}
        isNearLimit={draft.isNearLimit}
        inputRef={textareaRef}
        placeholder="Digite uma mensagem... (/ para comandos, @ para mencionar)"
        ariaLabel="Digite sua mensagem para o chat da equipe"
        onKeyDown={handleKeyDown}
        onPaste={draft.handlePaste}
        onClick={(e) => {
          const t = e.target as HTMLTextAreaElement;
          checkForMention(t.value, t.selectionStart ?? 0);
        }}
        className="border-t border-border bg-card px-4 py-3"
        slots={{
          plusMenuContent: (
            <div className="flex flex-col gap-1">
              <TeamFileUploader conversationId={conversationId} onFileSent={onFileSent} />
            </div>
          ),
          beforeTextarea: (
            <MentionAutocomplete
              inputValue={text}
              cursorPosition={mentionCursorPos}
              onSelect={handleMentionSelect}
              onClose={closeMention}
              isOpen={mentionOpen}
            />
          ),
          textareaOverlay:
            showMarkdownPreview && draft.hasText && showRichToolbar ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-1 max-h-[100px] overflow-y-auto rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
              >
                <MarkdownPreview text={text} className="leading-relaxed text-foreground" />
              </motion.div>
            ) : null,
          afterMic: (
            <>
              {!isMobile && (
                <div className="flex shrink-0 items-center gap-0.5">
                  {secondaryTools}
                  <TextToAudioButton inputValue={text} onAudioReady={onAudioSend} />
                </div>
              )}
              {isMobile && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <TeamFileUploader conversationId={conversationId} onFileSent={onFileSent} />
                </div>
              )}
            </>
          ),
          footer: isMobile ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="scrollbar-none mt-1.5 flex items-center gap-1 overflow-x-auto pb-0.5"
              role="toolbar"
              aria-label="Ferramentas de formatação"
            >
              {secondaryTools}
            </motion.div>
          ) : undefined,
        }}
      ></ComposerCore>
    </>
  );
}
