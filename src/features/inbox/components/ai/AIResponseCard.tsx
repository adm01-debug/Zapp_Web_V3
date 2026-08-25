/**
 * P20 — AIResponseCard
 * Card de resposta AI usando <Bubble side="received"> + MarkdownPreview.
 * Streaming: mostra ChatShimmer enquanto content está vazio.
 */
import { Bubble } from '@/components/ui/bubble';
import { ChatShimmer } from '@/components/ui/chat-shimmer';
import { MarkdownPreview } from '../chat/MarkdownPreview';
import { cn } from '@/lib/utils';

export interface AIResponseCardProps {
  content: string;
  isStreaming?: boolean;
  sources?: { url: string; title: string }[];
  className?: string;
}

export function AIResponseCard({
  content,
  isStreaming = false,
  sources,
  className,
}: AIResponseCardProps) {
  const showShimmer = isStreaming && !content;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Bubble side="received">
        {showShimmer ? (
          <ChatShimmer />
        ) : (
          <MarkdownPreview
            text={content}
            className="text-[14px] leading-relaxed"
          />
        )}
      </Bubble>

      {sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-2">
          {sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary/70 underline underline-offset-2 hover:text-primary"
            >
              {source.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
