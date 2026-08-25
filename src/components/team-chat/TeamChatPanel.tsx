import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSignedMediaUrlBatch } from '@/lib/useMediaUrl';
import { ErrorBoundary } from 'react-error-boundary';
import { getLogger } from '@/lib/logger';
import { useAuth } from '@/features/auth';
import { TeamConversation } from '@/hooks/useTeamChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, X, Search, Lock, Shield, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence, motion } from '@/components/ui/motion';
import { AddMembersDialog } from './AddMembersDialog';
import { TeamChatHeader } from './TeamChatHeader';
import { ParticipantStatsGraph } from './ParticipantStatsGraph';
import { TeamPerformancePanel } from './TeamPerformancePanel';
import { TeamChatInputArea } from './TeamChatInputArea';
import { useTeamChatPanel } from './useTeamChatPanel';
import { useTeamMessageReactions } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';
import { TeamMessageItem } from './TeamMessageItem';
import {
  ChatScrollerV2,
  type ChatScrollerV2Handle,
} from '@/features/inbox/components/chat/ChatScrollerV2';

interface Props {
  conversation: TeamConversation;
  onBack: () => void;
  onToggleDetails?: () => void;
  showDetails?: boolean;
}

const log = getLogger('TeamChatPanel');

export function TeamChatPanel(props: Props) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-4 text-center text-destructive">
          Erro ao carregar o chat. Por favor, tente recarregar.
        </div>
      }
      onError={(error) => log.error('TeamChatPanel error:', error)}
    >
      <TeamChatPanelContent {...props} />
    </ErrorBoundary>
  );
}

function TeamChatPanelContent({ conversation, onBack, onToggleDetails, showDetails }: Props) {
  const [showStats, setShowStats] = useState<'participants' | 'performance' | null>(null);
  const s = useTeamChatPanel(conversation);
  const {
    showSearch,
    setShowSearch,
    setSearchQuery,
    filteredMessages,
    profile,
    updateStatusMutation,
    isNearBottomRef,
    scrollRef,
    searchInputRef,
  } = s;
  const { profile: liveProfile } = useAuth();
  const {
    aggregate,
    toggle: toggleReaction,
    isToggling,
  } = useTeamMessageReactions(conversation.id);
  const { signedUrls } = useSignedMediaUrlBatch(
    filteredMessages,
    supabase as unknown as Parameters<typeof useSignedMediaUrlBatch>[1]
  );
  // E50: ref para ChatScrollerV2 (único componente de scroll do team-chat)
  const tanstackScrollerRef = useRef<ChatScrollerV2Handle>(null);

  // Keyboard shortcuts for chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD/CTRL + K to focus search inside chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }

      // ESC to close search or go back
      if (e.key === 'Escape') {
        if (showSearch) {
          setShowSearch(false);
          setSearchQuery('');
        } else if (onBack) {
          onBack();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, onBack, setShowSearch, setSearchQuery]);

  const isDeptMember = useMemo(() => {
    if (conversation.type !== 'department') return true;
    if (liveProfile?.role === 'admin') return true;
    return liveProfile?.department_id === conversation.department_id;
  }, [conversation, liveProfile]);

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;

    // Mark unread messages as read
    const unreadIds = filteredMessages
      .filter((m) => m.sender_id !== profile?.id && m.status !== 'read')
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      unreadIds.forEach((id) => {
        updateStatusMutation.mutate({
          messageId: id,
          status: 'read',
          conversationId: conversation.id,
        });
      });
    }
  }, [
    filteredMessages,
    conversation.id,
    profile,
    updateStatusMutation,
    isNearBottomRef,
    scrollRef,
  ]);

  useEffect(() => {
    // If we are at the bottom, stay at the bottom
    // E50: ChatScrollerV2 é sempre o componente — usa tanstackScrollerRef diretamente
    if (!isNearBottomRef.current) return;
    const lastIndex = filteredMessages.length - 1;
    if (lastIndex < 0) return;
    tanstackScrollerRef.current?.scrollToIndex(lastIndex);
  }, [filteredMessages, conversation.id, isNearBottomRef]);

  // Handle incoming messages while reading old ones
  useEffect(() => {
    if (!filteredMessages.length) return;

    const lastMsg = filteredMessages[filteredMessages.length - 1];
    const isNewMessageFromOthers = lastMsg.sender_id !== profile?.id;

    if (isNewMessageFromOthers && !isNearBottomRef.current && scrollRef.current) {
      // Don't auto-scroll, just keep position.
      // The scroll container naturally stays where it is if content is added at the end,
      // unless we are using a virtualized list that might shift things.
    }
  }, [filteredMessages, profile, isNearBottomRef, scrollRef]);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch, searchInputRef]);

  const dateFirstIndexes = useMemo(() => {
    const seen = new Set<string>();
    const result = new Set<number>();
    s.filteredMessages.forEach((msg, idx) => {
      const k = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (!seen.has(k)) {
        seen.add(k);
        result.add(idx);
      }
    });
    return result;
  }, [s.filteredMessages]);

  return (
    <div className="relative flex h-full w-full flex-col @container/team-chat">
      <TeamChatHeader
        conversation={conversation}
        showDetails={showDetails}
        voiceId={s.tts.voiceId}
        speed={s.tts.speed}
        showSearch={s.showSearch}
        isMuted={s.isMuted}
        onBack={onBack}
        onToggleDetails={onToggleDetails}
        onToggleSearch={() => {
          s.setShowSearch(!s.showSearch);
          if (s.showSearch) s.setSearchQuery('');
        }}
        onAddMembers={() => s.setShowAddMembers(true)}
        onVoiceChange={s.tts.setVoiceId}
        onSpeedChange={s.tts.setSpeed}
        onToggleMute={() =>
          s.muteMutation.mutate({ conversationId: conversation.id, muted: !s.isMuted })
        }
        onToggleStats={() => setShowStats(showStats === 'participants' ? null : 'participants')}
        onTogglePerformance={() => setShowStats(showStats === 'performance' ? null : 'performance')}
        showStats={!!showStats}
      />

      <AnimatePresence>
        {s.showSearch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-border bg-card px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                ref={s.searchInputRef}
                value={s.searchQuery}
                onChange={(e) => s.syncSearchWithCache(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    s.setShowSearch(false);
                    s.setSearchQuery('');
                  }
                }}
                placeholder="Buscar nas mensagens..."
                className="h-8 text-sm"
              />
              {s.searchQuery && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {s.filteredMessages.length} resultado{s.filteredMessages.length !== 1 ? 's' : ''}
                </span>
              )}
              <Button
                aria-label="Fechar busca"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  s.setShowSearch(false);
                  s.setSearchQuery('');
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border bg-muted/30"
          >
            <div className="p-4">
              {showStats === 'participants' ? (
                <ParticipantStatsGraph conversationId={conversation.id} />
              ) : (
                <TeamPerformancePanel conversationId={conversation.id} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative min-h-0 flex-1 bg-background">
        <div
          ref={s.scrollRef}
          className="scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40 absolute inset-0 overflow-auto"
          onScroll={(e) => {
            s.checkNearBottom();
            const el = e.target as HTMLDivElement;

            // Infinite scroll UP
            if (el.scrollTop < 100 && s.hasNextPage && !s.isFetchingNextPage) {
              s.fetchNextPage();
            }

            s.lastScrollTopRef.current = el.scrollTop;
          }}
          role="log"
          aria-label="Mensagens da conversa"
          aria-live="polite"
        >
          {!isDeptMember ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-bold">Conteúdo Protegido</h3>
              <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                As mensagens deste departamento são privadas e restritas aos seus membros.
              </p>
              <div className="flex w-full max-w-[280px] flex-col gap-3">
                <div className="rounded-xl border border-border/50 bg-card p-3 text-left shadow-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                    <Shield className="h-3 w-3 text-primary" /> Solicitar Acesso
                  </p>
                  <p className="text-[11px] leading-normal text-muted-foreground">
                    Contate o administrador do sistema para que ele associe seu perfil a este
                    departamento.
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card p-3 text-left shadow-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                    <Link2 className="h-3 w-3 text-primary" /> Entrar via Código
                  </p>
                  <p className="text-[11px] leading-normal text-muted-foreground">
                    Se você recebeu um código de convite, utilize-o para entrar automaticamente
                    através do link oficial.
                  </p>
                </div>
              </div>
            </div>
          ) : s.isLoading && !s.filteredMessages.length ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                  <Skeleton className="h-10 rounded-2xl" style={{ width: 120 + (i % 3) * 60 }} />
                </div>
              ))}
            </div>
          ) : s.filteredMessages.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {s.searchQuery ? 'Nenhuma mensagem encontrada' : 'Envie a primeira mensagem!'}
            </div>
          ) : (
            <div className="relative flex h-full w-full flex-col">
              <AnimatePresence>
                {s.hasNewMessagesUnseen && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
                  >
                    <Button
                      aria-label="Rolar para o final"
                      size="sm"
                      className="gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
                      onClick={s.scrollToBottom}
                    >
                      <ArrowDown className="h-4 w-4 animate-bounce" />
                      Pular para mensagens novas
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {s.isFetchingNextPage && (
                <div className="animate-pulse p-2 text-center text-xs text-muted-foreground">
                  Carregando mensagens anteriores...
                </div>
              )}
              <div className="relative flex-1">
                <ChatScrollerV2
                  ref={tanstackScrollerRef}
                  messages={s.filteredMessages as unknown as import('@/types/chat').Message[]}
                  estimateSize={() => 80}
                  renderItem={(_msg, index) => {
                    const msg = s.filteredMessages[index];
                    const showDate = dateFirstIndexes.has(index);
                    const isMine = msg.sender_id === s.profile?.id;
                    const repliedMsg = msg.reply_to_id
                      ? s.messages.find((m) => m.id === msg.reply_to_id)
                      : null;
                    return (
                      <TeamMessageItem
                        msg={msg}
                        showDate={showDate}
                        isMine={isMine}
                        isEditing={s.editingId === msg.id}
                        editText={s.editText}
                        repliedMsg={repliedMsg ?? null}
                        signedUrl={signedUrls.get(msg.id)}
                        reactions={aggregate(msg.id)}
                        isToggling={isToggling}
                        conversation={conversation}
                        ttsPlaying={s.tts.isPlaying && s.tts.currentMessageId === msg.id}
                        ttsLoading={s.tts.isLoading && s.tts.currentMessageId === msg.id}
                        onReaction={(emoji) => toggleReaction({ messageId: msg.id, emoji })}
                        onReply={() => s.setReplyTo(msg)}
                        onCopy={() => s.handleCopyMessage(msg.content || '')}
                        onEdit={() => s.handleStartEdit(msg)}
                        onDelete={() => s.handleDelete(msg.id)}
                        onEditChange={s.setEditText}
                        onEditSave={s.handleSaveEdit}
                        onEditCancel={s.handleCancelEdit}
                        onTtsToggle={() =>
                          s.tts.isPlaying && s.tts.currentMessageId === msg.id
                            ? s.tts.stop()
                            : s.tts.speak(msg.content, msg.id)
                        }
                      />
                    );
                  }}
                  className="scrollbar-none absolute inset-0"
                  overscan={10}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {s.showScrollDown && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2"
          >
            {s.hasNewMessagesUnseen && (
              <div className="animate-bounce rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-md">
                Novas mensagens
              </div>
            )}
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full border border-primary/20 shadow-lg"
              onClick={s.scrollToBottom}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {isDeptMember ? (
        <TeamChatInputArea
          conversationId={conversation.id}
          text={s.text}
          setText={s.setText}
          replyTo={s.replyTo}
          isRecordingAudio={s.isRecordingAudio}
          isPending={s.sendMutation.isPending}
          onSend={s.handleSend}
          onCancelReply={() => s.setReplyTo(null)}
          onRecordToggle={() => s.setIsRecordingAudio(!s.isRecordingAudio)}
          onAudioSend={s.handleAudioSend}
          onSendSticker={s.handleSendSticker}
          onSendAudioMeme={s.handleSendAudioMeme}
          onSendCustomEmoji={s.handleSendCustomEmoji}
          onFileSent={s.handleFileSent}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 border-t border-border bg-muted/30 p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <Lock className="h-5 w-5 text-destructive" />
          </div>
          <p className="text-sm font-semibold text-foreground">Acesso Restrito ao Departamento</p>
          <p className="mb-4 max-w-xs text-xs text-muted-foreground">
            Você não faz parte deste departamento e não tem permissão para visualizar ou enviar
            mensagens.
          </p>
          <div className="max-w-xs rounded-xl border border-primary/10 bg-primary/5 p-4">
            <p className="mb-1 text-xs font-medium text-primary">Como obter acesso?</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Solicite ao administrador da sua conta ou ao gestor do departamento que inclua você
              via painel de membros ou enviando um código de convite.
            </p>
          </div>
        </div>
      )}

      <AddMembersDialog
        open={s.showAddMembers}
        onOpenChange={s.setShowAddMembers}
        conversation={conversation}
      />
    </div>
  );
}
