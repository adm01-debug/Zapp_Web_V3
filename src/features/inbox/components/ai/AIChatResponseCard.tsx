/**
 * P20 — AIChatResponseCard (ex-AIResponseCard; renomeado para evitar colisão com
 * ai-tools/AIResponseCard que tem interface incompatível).
 *
 * Card de resposta de streaming AI usando <Bubble side="received"> + MarkdownPreview.
 * Streaming: mostra ChatShimmer enquanto content está vazio (isStreaming=true).
 */
import { Bubble } from '@/components/ui/bubble';
import { ChatShimmer } from '@/components/ui/chat-shimmer';
import { MarkdownPreview } from '../chat/MarkdownPreview';
import { cn } from '@/lib/utils';

export interface AIChatResponseCardProps {
  /** Conteúdo da resposta AI (pode estar parcialmente preenchido durante streaming). */
  content: string;
  /** true enquanto o stream ainda não terminou. */
  isStreaming?: boolean;
  /** Fontes citadas pela resposta (exibidas como links abaixo do conteúdo). */
  sources?: { url: string; title: string }[];
  className?: string;
}

export function AIChatResponseCard({
  content,
  isStreaming = false,
  sources,
  className,
}: AIChatResponseCardProps) {
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
