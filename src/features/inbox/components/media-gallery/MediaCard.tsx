import { useState, memo } from 'react';
import { motion } from '@/components/ui/motion';
import { Image, FileVideo, FileAudio, File, Play, Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MediaItem } from './mediaUtils';

interface MediaCardProps {
  item: MediaItem;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}

/** Media Card component for the media gallery section. */
export const MediaCard = memo(function MediaCard({
  item,
  isSelected,
  onSelect,
  onPreview,
}: MediaCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected
          ? 'border-primary ring-2 ring-primary/30'
          : 'border-transparent hover:border-primary/50'
      )}
      role="button"
      tabIndex={0}
      aria-label="Visualizar mídia"
      onClick={onPreview}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPreview()}
    >
      <div
        className={cn(
          'absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-all',
          isSelected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/50 bg-background/80 opacity-0 group-hover:opacity-100'
        )}
        role="checkbox"
        aria-checked={isSelected}
        aria-label="Selecionar mídia"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            onSelect();
          }
        }}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </div>

      <div className="relative aspect-square bg-muted">
        {item.type === 'image' && (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            )}
            {!hasError ? (
              <img
                src={item.url}
                alt={item.filename}
                loading="lazy"
                decoding="async"
                className={cn('h-full w-full object-cover', isLoading && 'opacity-0')}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Image className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </>
        )}
        {item.type === 'video' && (
          <div className="flex h-full w-full items-center justify-center bg-background/80">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/20 backdrop-blur">
                <Play className="h-6 w-6 text-primary-foreground" fill="white" />
              </div>
            </div>
            <FileVideo className="absolute bottom-2 right-2 h-8 w-8 text-muted-foreground" />
          </div>
        )}
        {item.type === 'audio' && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
            <FileAudio className="h-10 w-10 text-primary" />
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {item.filename}
            </span>
          </div>
        )}
        {item.type === 'document' && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
            <File className="h-10 w-10 text-info" />
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {item.filename}
            </span>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="text-xs text-primary-foreground">
          {format(new Date(item.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
        </p>
      </div>
    </motion.div>
  );
});
