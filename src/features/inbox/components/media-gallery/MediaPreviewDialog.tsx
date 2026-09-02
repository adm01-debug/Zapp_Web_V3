import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download, File } from 'lucide-react';
import { MediaItem } from './mediaUtils';

interface MediaPreviewDialogProps {
  item: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Media Preview Dialog component for the media gallery section. */
export function MediaPreviewDialog({ item, open, onOpenChange }: MediaPreviewDialogProps) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate">{item.filename}</span>
            <div className="flex items-center gap-2">
              <Button aria-label="Abrir em nova aba" variant="ghost" size="icon" asChild>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button aria-label="Baixar arquivo" variant="ghost" size="icon" asChild>
                <a href={item.url} download={item.filename}>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[400px] items-center justify-center bg-background/90 p-4">
          {item.type === 'image' && (
            <img
              loading="lazy"
              decoding="async"
              src={item.url}
              alt={item.filename}
              className="max-h-[70vh] max-w-full object-contain"
            />
          )}
          {item.type === 'video' && (
            <>
              <video
                src={item.url}
                controls
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
                className="max-h-[70vh] max-w-full"
              />
              <p className="sr-only">Legendas não disponíveis para este vídeo.</p>
            </>
          )}
          {item.type === 'audio' && (
            <div className="p-8">
              <audio src={item.url} controls className="w-full" />
            </div>
          )}
          {item.type === 'document' && (
            <div className="p-8 text-center">
              <File className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
              <p className="mb-4 text-primary-foreground">{item.filename}</p>
              <Button asChild>
                <a href={item.url} download={item.filename}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
