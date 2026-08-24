import { useEffect, memo, lazy, Suspense } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('VirtualMessageBubble');
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Message, InteractiveButton } from '@/types/chat';
import { motion } from '@/components/ui/motion';
import { MessageReactions } from './MessageReactions';
import { MessageImage } from './ImagePreview';
import { DocumentPreview, VideoPreview } from './MediaPreview';
import { InteractiveMessageDisplay, ButtonResponseBadge } from './InteractiveMessage';
import { DeletedMessagePlaceholder } from './DeletedMessagePlaceholder';
import { QuotedMessage } from './ReplyQuote';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { TextToSpeechButton } from './TextToSpeechButton';
import { Reply, Forward, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { MessageStatusInline } from './chat/MessageStatusInline';
import { useContactAvatar } from '@/features/inbox';
const LocationMessageDisplay = lazy(() =>
  import('./LocationMessage').then((m) => ({ default: m.LocationMessageDisplay }))
);

function formatMessageTime(date: Date): string {
  return format(date, 'HH:mm');
}

interface MessageBubbleProps {
  message: Message;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  onSpeak: (messageId: string, text: string) => void;
  onStopSpeak: () => void;
  scrollToMessage: (messageId: string) => void;
  instanceName?: string;
  contactJid?: string;
  contactAvatar?: string;
}

/** Message Bubble component. */
export const MessageBubble = memo(
  ({
    message,
    onReply,
    onForward,
    onCopy,
    onInteractiveButtonClick,
    ttsLoading,
    ttsPlaying,
    ttsMessageId,
    onSpeak,
    onStopSpeak,
    scrollToMessage,
    instanceName,
    contactJid,
    contactAvatar,
  }: MessageBubbleProps) => {
    const isSent = message.sender === 'agent';
    const { avatarUrl } = useContactAvatar(
      message.conversationId,
      message.contactAvatar || contactAvatar
    );

    const mediaRefreshKey =
      instanceName && contactJid && message.external_id
        ? {
            instanceName,
            remoteJid: contactJid,
            fromMe: isSent,
            id: message.external_id,
            // FIX 2026-08-03 (Gap 4): skip-list para tipos de mídia não-recarregáveis
            messageType: message.type ?? null,
          }
        : undefined;

    useEffect(() => {
      if (!isSent && !avatarUrl && !contactAvatar) {
        log.warn('No avatar available for received message', {
          messageId: message.id,
          conversationId: message.conversationId,
          senderName: message.senderName,
        });
      }
    }, [isSent, avatarUrl, contactAvatar, message]);

    return (
      <motion.div
        data-testid="message-bubble"
        layout
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30,
          mass: 0.8,
        }}
        className={cn('group flex gap-2.5 px-4 py-1.5', isSent ? 'justify-end' : 'justify-start')}
      >
        {!isSent && (
          <Avatar className="mb-1 h-9 w-9 shrink-0 self-end border border-border/5 shadow-md ring-2 ring-background transition-transform group-hover:scale-105">
            <AvatarImage
              src={avatarUrl || undefined}
              alt={message.senderName || 'Contato'}
              referrerPolicy="no-referrer"
              className="object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).removeAttribute('src');
              }}
            />
            <AvatarFallback className="bg-primary/10 text-[10px] font-black uppercase tracking-tighter text-primary">
              {(message.senderName || 'C').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="relative max-w-[70%] space-y-1">
          <div
            className={cn(
              'absolute top-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
              isSent ? 'right-full mr-2' : 'left-full ml-2'
            )}
          >
            <ActionButton
              icon={<Reply className="h-3.5 w-3.5" />}
              title="Responder"
              onClick={() => onReply(message)}
            />
            <ActionButton
              icon={<Forward className="h-3.5 w-3.5" />}
              title="Encaminhar"
              onClick={() => onForward(message)}
            />
            <ActionButton
              icon={<Copy className="h-3.5 w-3.5" />}
              title="Copiar"
              onClick={() => onCopy(message.content)}
            />
            {message.type === 'text' && (
              <TextToSpeechButton
                messageId={message.id}
                text={message.content}
                isLoading={ttsLoading}
                isPlaying={ttsPlaying}
                currentMessageId={ttsMessageId}
                onSpeak={onSpeak}
                onStop={onStopSpeak}
                className="rounded-full border border-border/50 bg-card p-1.5 shadow-sm"
              />
            )}
          </div>

          {message.is_deleted ? (
            <DeletedMessagePlaceholder isSent={isSent} content={message.content} />
          ) : (
            <motion.div
              layout
              whileHover={{ scale: 1.005 }}
              className={cn(
                'relative overflow-visible transition-all',
                (message.type === 'image' || message.type === 'video') && !message.content
                  ? 'p-1 pb-0'
                  : 'px-4 py-2.5',
                isSent
                  ? 'ml-12 rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'mr-12 rounded-2xl rounded-bl-md border border-border/70 bg-card text-card-foreground shadow-sm'
              )}
            >
              {message.replyTo && (
                <QuotedMessage
                  replyTo={message.replyTo}
                  isSent={isSent}
                  onClick={() => {
                    if (message.replyTo) scrollToMessage(message.replyTo.messageId);
                  }}
                />
              )}
              {message.buttonResponse && (
                <ButtonResponseBadge
                  buttonTitle={message.buttonResponse.buttonTitle}
                  isSent={isSent}
                />
              )}
              {message.type === 'interactive' && message.interactive && (
                <InteractiveMessageDisplay
                  interactive={message.interactive}
                  isSent={isSent}
                  onButtonClick={onInteractiveButtonClick}
                />
              )}
              {message.type === 'image' && message.mediaUrl && (
                <div className="mb-2 overflow-hidden rounded-lg">
                  <MessageImage src={message.mediaUrl} refreshKey={mediaRefreshKey} />
                </div>
              )}
              {message.type === 'video' && message.mediaUrl && (
                <div className="mb-2">
                  <VideoPreview
                    url={message.mediaUrl}
                    caption={message.content}
                    isSent={isSent}
                    refreshKey={mediaRefreshKey}
                  />
                </div>
              )}
              {message.type === 'audio' && message.mediaUrl && (
                <div className="mb-2">
                  <AudioMessagePlayer
                    audioUrl={message.mediaUrl}
                    messageId={message.id}
                    isSent={isSent}
                    existingTranscription={message.transcription}
                    transcriptionStatus={message.transcriptionStatus}
                    refreshKey={mediaRefreshKey}
                  />
                </div>
              )}
              {message.type === 'document' && message.mediaUrl && (
                <div className="mb-2">
                  <DocumentPreview url={message.mediaUrl} fileName="document" isSent={isSent} />
                </div>
              )}
              {message.type === 'location' && message.location && (
                <Suspense
                  fallback={<div className="h-32 w-full animate-pulse rounded-lg bg-muted" />}
                >
                  <LocationMessageDisplay location={message.location} isSent={isSent} />
                </Suspense>
              )}
              {message.content && message.type === 'text' && (
                <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.6] tracking-tight">
                  {message.content}
                </p>
              )}
              <div
                className={cn(
                  '-mb-0.5 mt-1.5 flex items-center justify-end gap-1.5',
                  isSent ? 'text-primary-foreground/75' : 'text-muted-foreground'
                )}
              >
                <span className="text-[11px] font-normal leading-none">
                  {formatMessageTime(message.timestamp)}
                </span>
                {isSent && (
                  <MessageStatusInline message={message} className="origin-right scale-90" />
                )}
              </div>
            </motion.div>
          )}

          <MessageReactions messageId={message.id} isSent={isSent} />
        </div>
      </motion.div>
    );
  }
);

function ActionButton({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.15, rotate: 5 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="rounded-full border border-border/20 bg-background/80 p-2 text-muted-foreground shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-primary/10 hover:text-primary"
      title={title}
    >
      {icon}
    </motion.button>
  );
}
