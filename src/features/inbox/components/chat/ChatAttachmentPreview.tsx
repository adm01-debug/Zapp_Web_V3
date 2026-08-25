/**
 * P12 (E61) — ChatAttachmentPreview
 * Bloco extraído de ChatInputArea.tsx — pré-visualização de anexos antes do envio.
 */
import { AnimatePresence, motion } from '@/components/ui/motion';
import { FileVideo, FileAudio, FileText, ImageIcon, X } from 'lucide-react';
import type { ChatInputAttachment } from './useChatInputLogic';

interface ChatAttachmentPreviewProps {
  attachments: ChatInputAttachment[];
  onRemove: (id: string) => void;
}

export function ChatAttachmentPreview({ attachments, onRemove }: ChatAttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="attachments-preview"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="border-t border-border/50 bg-background/80 px-4 py-2 backdrop-blur-sm"
      >
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <motion.div
              key={att.id}
              layout
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
            >
              {att.preview ? (
                <img
                  loading="lazy"
                  decoding="async"
                  src={att.preview}
                  alt="Pré-visualização do anexo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 p-1 text-muted-foreground">
                  {att.category === 'video' ? (
                    <FileVideo className="h-6 w-6" />
                  ) : att.category === 'audio' ? (
                    <FileAudio className="h-6 w-6" />
                  ) : att.category === 'image' ? (
                    <ImageIcon className="h-6 w-6" />
                  ) : (
                    <FileText className="h-6 w-6" />
                  )}
                  <span className="max-w-full truncate text-center text-[8px]">
                    {att.file.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemove(att.id)}
                className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/60 p-0.5 text-white group-hover:flex"
                aria-label={`Remover anexo ${att.file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
