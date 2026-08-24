import { motion } from '@/components/ui/motion';
import {
  X,
  Reply,
  CornerDownRight,
  Image,
  Video,
  FileText,
  Music,
  MapPin,
  Sticker,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';

interface ReplyPreviewProps {
  message: Message;
  onCancel: () => void;
}

function getMediaInfo(message: Message): { icon: React.ElementType; label: string } | null {
  const type = message.type || message.message_type;
  switch (type) {
    case 'audio':
      return { icon: Music, label: '🎵 Mensagem de áudio' };
    case 'image':
      return { icon: Image, label: '📷 Imagem' };
    case 'video':
      return { icon: Video, label: '🎥 Vídeo' };
    case 'document':
      return { icon: FileText, label: '📄 Documento' };
    case 'sticker':
      return { icon: Sticker, label: '🎨 Figurinha' };
    case 'location':
      return { icon: MapPin, label: '📍 Localização' };
    default:
      return null;
  }
}

/** Reply Preview component. */
export function ReplyPreview({ message, onCancel }: ReplyPreviewProps) {
  const isSent = message.sender === 'agent';
  const mediaInfo = getMediaInfo(message);
  const MediaIcon = mediaInfo?.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: 10, height: 0 }}
      className="mx-4 mb-2"
    >
      <div
        className={cn(
          'flex items-start gap-2 rounded-lg border-l-4 p-3',
          isSent ? 'border-primary bg-primary/10' : 'border-muted-foreground bg-muted/50'
        )}
      >
        <Reply className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'mb-0.5 text-xs font-medium',
              isSent ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            Respondendo a {isSent ? 'você' : 'contato'}
          </p>
          <div className="flex items-center gap-1.5">
            {MediaIcon && <MediaIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <p className="line-clamp-2 text-sm text-foreground">
              {mediaInfo ? mediaInfo.label : message.content}
            </p>
          </div>
          {/* Show thumbnail for images */}
          {message.mediaUrl && (message.type === 'image' || message.message_type === 'image') && (
            <img
              src={message.mediaUrl}
              alt="Imagem citada"
              className="mt-1.5 h-12 w-12 rounded object-cover"
            />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={onCancel}
          aria-label="Cancelar resposta"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}

interface QuotedMessageProps {
  replyTo: {
    messageId: string;
    content: string;
    sender: 'contact' | 'agent';
    type?: string;
  };
  isSent: boolean;
  onClick?: () => void;
}

/** Quoted Message component. */
export function QuotedMessage({ replyTo, isSent, onClick }: QuotedMessageProps) {
  const isQuoteFromAgent = replyTo.sender === 'agent';

  const typeLabels: Record<string, string> = {
    audio: '🎵 Áudio',
    image: '📷 Imagem',
    video: '🎥 Vídeo',
    document: '📄 Documento',
    sticker: '🎨 Figurinha',
    location: '📍 Localização',
  };

  const displayContent =
    replyTo.type && typeLabels[replyTo.type] ? typeLabels[replyTo.type] : replyTo.content;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className={cn(
        'mb-2 w-full rounded-lg border-l-2 p-2 text-left transition-colors',
        isSent
          ? 'border-primary-foreground/50 bg-primary-foreground/10 hover:bg-primary-foreground/20'
          : 'border-muted-foreground/50 bg-muted/50 hover:bg-muted'
      )}
    >
      <div className="flex items-start gap-1.5">
        <CornerDownRight
          className={cn(
            'mt-0.5 h-3 w-3 flex-shrink-0',
            isSent ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'mb-0.5 text-[10px] font-medium',
              isSent
                ? 'text-primary-foreground/80'
                : isQuoteFromAgent
                  ? 'text-primary'
                  : 'text-muted-foreground'
            )}
          >
            {isQuoteFromAgent ? 'Você' : 'Contato'}
          </p>
          <p
            className={cn(
              'line-clamp-2 text-xs',
              isSent ? 'text-primary-foreground/90' : 'text-foreground/80'
            )}
          >
            {displayContent}
          </p>
        </div>
      </div>
    </motion.button>
  );
}
