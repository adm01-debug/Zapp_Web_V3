/**
 * @file TeamMessageItem.tsx
 * @description Item de mensagem extraído do renderItem do TeamChatPanel.
 * Encapsula ContextMenu + bubble + reactions + edição inline.
 *
 * E60 — feat/chat-ui-100
 */
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MarkdownPreview } from '@/features/inbox';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { bubbleVariants, Bubble } from '@/components/ui/bubble';
import { WHATSAPP_EMOJIS } from '@/components/ui/message-reactions';
import { TeamReactionBar, TeamQuickReactionBarWrapper } from './TeamMessageReactionsWrapper';
import {
  Pencil,
  Trash2,
  X,
  Check,
  Reply,
  Copy,
  Volume2,
  VolumeX,
  Loader2,
  SmilePlus,
} from 'lucide-react';
import type { AggregatedReaction } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';
import type { TeamConversation } from '@/hooks/useTeamChat';
import { MessageStatus } from '@/features/inbox';

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface TeamMessage {
  id: string;
  content: string | null;
  created_at: string;
  sender_id: string;
  sender?: { name?: string | null; avatar_url?: string | null } | null;
  media_url?: string | null;
  media_type?: string | null;
  reply_to_id?: string | null;
  is_edited?: boolean;
  is_deleted?: boolean;
  status?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateSep(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function MediaTypeIcon({ type }: { type: string }) {
  if (type === 'image') return <span>🖼️</span>;
  if (type === 'video') return <span>🎬</span>;
  if (type === 'audio') return <span>🎵</span>;
  return <span>📎</span>;
}

function MediaContent({ msg, resolvedUrl }: { msg: TeamMessage; resolvedUrl?: string }) {
  const url = resolvedUrl || msg.media_url || '';
  if (msg.media_type === 'image') {
    return (
      <img
        src={url}
        alt="Imagem"
        loading="lazy"
        decoding="async"
        className="max-h-60 rounded-xl object-cover"
      />
    );
  }
  if (msg.media_type === 'video') {
    return <video src={url} controls className="max-h-60 w-full rounded-xl" />;
  }
  if (msg.media_type === 'audio') {
    return <audio src={url} controls className="w-full" />;
  }
  if (msg.media_type === 'document') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
        📎 {msg.content || 'Documento'}
      </a>
    );
  }
  return null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TeamMessageItemProps {
  msg: TeamMessage;
  showDate: boolean;
  isMine: boolean;
  isEditing: boolean;
  editText: string;
  repliedMsg: TeamMessage | null;
  signedUrl?: string;
  reactions: AggregatedReaction[];
  isToggling: boolean;
  conversation: Pick<TeamConversation, 'type'>;
  ttsPlaying: boolean;
  ttsLoading: boolean;

  onReaction: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onEditChange: (text: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onTtsToggle: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function TeamMessageItem({
  msg,
  showDate,
  isMine,
  isEditing,
  editText,
  repliedMsg,
  signedUrl,
  reactions,
  isToggling,
  conversation,
  ttsPlaying,
  ttsLoading,
  onReaction,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onEditChange,
  onEditSave,
  onEditCancel,
  onTtsToggle,
}: TeamMessageItemProps) {
  const hasMedia = !!msg.media_url;
  const cleanText = msg.content
    ?.replace(/\[.*?\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();

  return (
    <ContextMenu key={msg.id}>
      <ContextMenuTrigger asChild>
        <div
          data-testid={`message-container-${msg.id}`}
          className="group/msg relative px-4 @container/msg"
        >
          {showDate && (
            <div className="flex justify-center py-2">
              <span className="rounded-full border border-border/10 bg-muted/20 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {formatDateSep(msg.created_at)}
              </span>
            </div>
          )}

          <div
            className={cn('relative flex gap-2 py-0.5', isMine ? 'justify-end' : 'justify-start')}
          >
            {!isMine && (
              <Avatar className="mt-1 h-7 w-7 shrink-0">
                <AvatarImage src={msg.sender?.avatar_url || undefined} />
                <AvatarFallback className="bg-muted text-[10px]">
                  {msg.sender?.name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
            )}

            <div className={cn('relative max-w-[70%] space-y-1')}>
              <TeamQuickReactionBarWrapper
                messageId={msg.id}
                isMine={isMine}
                onToggle={onReaction}
                reactions={reactions}
              />

              {/* P06 (E55): usa <Bubble side> direto quando chat_bubble_v2=true */}
              <div
                className={cn(
                  'relative rounded-2xl px-3.5 py-2 shadow-none',
                  isFeatureEnabled('chat_bubble_v2')
                    ? bubbleVariants({ side: isMine ? 'sent' : 'received' })
                    : isMine
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md border border-border/20 bg-muted/30 text-foreground'
                )}
              >
                {!isMine && conversation.type === 'group' && (
                  <p className="mb-1 text-[11px] font-bold text-primary opacity-90">
                    {msg.sender?.name}
                  </p>
                )}

                {repliedMsg && (
                  <div
                    className={cn(
                      'mb-1.5 rounded border-l-2 px-2 py-1 text-[10px]',
                      isMine
                        ? 'border-primary-foreground/30 bg-primary-foreground/10'
                        : 'border-muted-foreground/30 bg-muted/50'
                    )}
                  >
                    <span className="font-medium">{repliedMsg.sender?.name}</span>
                    <p className="flex items-center gap-1 truncate opacity-80">
                      {repliedMsg.media_type && <MediaTypeIcon type={repliedMsg.media_type} />}
                      {repliedMsg.content || 'Mídia'}
                    </p>
                  </div>
                )}

                {isEditing ? (
                  <div className="space-y-1.5">
                    <Input
                      value={editText}
                      onChange={(e) => onEditChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onEditSave();
                        if (e.key === 'Escape') onEditCancel();
                      }}
                      className="h-7 bg-background text-sm text-foreground"
                      autoFocus
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        aria-label="Cancelar edição"
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={onEditCancel}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <Button
                        aria-label="Salvar edição"
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={onEditSave}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {hasMedia && <MediaContent msg={msg} resolvedUrl={signedUrl} />}
                    {msg.content && (!hasMedia || msg.media_type === 'document') && (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        <MarkdownPreview text={msg.content} className="inline" />
                      </p>
                    )}
                    {msg.content &&
                      hasMedia &&
                      msg.media_type !== 'document' &&
                      ![
                        '🎨 Figurinha',
                        '🎵 Áudio meme',
                        '😀 Emoji',
                        '🎤 Mensagem de áudio',
                      ].includes(msg.content) && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {msg.content}
                        </p>
                      )}
                    <div
                      className={cn(
                        'mt-0.5 flex items-center gap-1',
                        isMine ? 'justify-end' : 'justify-between'
                      )}
                    >
                      {cleanText && (
                        <button
                          onClick={onTtsToggle}
                          className={cn(
                            'rounded-full p-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100',
                            isMine
                              ? 'text-primary-foreground/60 hover:text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {ttsLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : ttsPlaying ? (
                            <VolumeX className="h-3 w-3" />
                          ) : (
                            <Volume2 className="h-3 w-3" />
                          )}
                        </button>
                      )}
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            'text-[10px]',
                            isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'
                          )}
                        >
                          {formatTime(msg.created_at)}
                          {msg.is_edited && ' · editado'}
                        </span>
                        {isMine && (
                          <MessageStatus
                            status={msg.status || 'sent'}
                            className={cn(
                              'origin-right scale-75',
                              msg.status === 'read' ? 'text-info' : 'text-primary-foreground/60'
                            )}
                          />
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <TeamReactionBar
            messageId={msg.id}
            reactions={reactions}
            isMine={isMine}
            isToggling={isToggling}
            onToggle={onReaction}
          />
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <SmilePlus className="h-3.5 w-3.5" /> Reagir
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <div className="grid grid-cols-4 gap-1 p-1">
              {WHATSAPP_EMOJIS.map((e) => (
                <Button
                  key={e}
                  size="icon"
                  variant="ghost"
                  onClick={() => onReaction(e)}
                  className="h-9 w-9 text-xl transition-all hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Reagir com ${e}`}
                >
                  {e}
                </Button>
              ))}
            </div>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={onReply} className="gap-2">
          <Reply className="h-3.5 w-3.5" /> Responder
        </ContextMenuItem>
        <ContextMenuItem onClick={onCopy} className="gap-2">
          <Copy className="h-3.5 w-3.5" /> Copiar Texto
        </ContextMenuItem>
        {isMine && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onEdit} className="gap-2">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </ContextMenuItem>
            <ContextMenuItem onClick={onDelete} className="gap-2 text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
