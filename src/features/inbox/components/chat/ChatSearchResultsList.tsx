import { forwardRef } from 'react';
import { motion } from '@/components/ui/motion';
import { FileText, Image, Video, Music, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { HighlightedText } from './HighlightedText';
import type { Message } from '@/types/chat';

const TYPE_ICON_MAP: Record<string, typeof FileText> = {
  image: Image,
  video: Video,
  audio: Music,
  document: File,
};

interface ChatSearchResultsListProps {
  results: Message[];
  activeIndex: number;
  debouncedQuery: string;
  onSelect: (idx: number, messageId: string) => void;
  /** Número máximo de resultados exibidos (default: 5). @default 5 */
  maxResults?: number;
  /** Callback ao clicar em "+N mais" — abre a lista completa no SearchBar. */
  onShowAll?: () => void;
}

/** Chat Search Results List component for the chat section. */
export const ChatSearchResultsList = forwardRef<HTMLDivElement, ChatSearchResultsListProps>(
  ({ results, activeIndex, debouncedQuery, onSelect, maxResults = 5, onShowAll }, ref) => {
    // E12 A9: emite EmptyState explícito em vez de return null silencioso
    if (results.length === 0) {
      return (
        <div
          ref={ref}
          className="rounded-lg bg-muted/30 px-3 py-2 text-center text-[11px] text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Nenhum resultado para esta busca.
        </div>
      );
    }

    const visible = results.slice(0, maxResults);
    const extra = results.length - maxResults;

    return (
      <div
        ref={ref}
        className="scrollbar-thin max-h-[140px] space-y-0.5 overflow-y-auto rounded-lg bg-muted/30 p-1"
      >
        {visible.map((msg, idx) => {
          const snippet = (msg.content || msg.transcription || msg.mediaUrl || '').slice(0, 80);
          const TypeIcon = TYPE_ICON_MAP[msg.type] || FileText;
          const isActive = activeIndex === idx;
          return (
            <motion.button
              key={msg.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => onSelect(idx, msg.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-all duration-150',
                isActive
                  ? 'bg-primary/15 text-foreground ring-1 ring-primary/20'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <TypeIcon
                className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'opacity-50')}
              />
              <span className="w-10 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {format(msg.timestamp, 'HH:mm')}
              </span>
              <span className="flex-1 truncate">
                <HighlightedText text={snippet} query={debouncedQuery} />
                {(msg.content || msg.transcription || msg.mediaUrl || '').length > 80 && '\u2026'}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium',
                  msg.sender === 'agent'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {msg.sender === 'agent' ? 'Você' : 'Contato'}
              </span>
            </motion.button>
          );
        })}
        {/* E12 A9: "+N mais" vira botão clicável que chama onShowAll */}
        {extra > 0 && (
          <button
            type="button"
            onClick={onShowAll}
            className="w-full rounded px-2.5 py-1 text-left text-[10px] text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            +{extra} {extra === 1 ? 'resultado' : 'resultados'} — ver todos
          </button>
        )}
      </div>
    );
  }
);

ChatSearchResultsList.displayName = 'ChatSearchResultsList';
