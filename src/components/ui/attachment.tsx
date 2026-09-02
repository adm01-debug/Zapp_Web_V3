/**
 * E33 — Attachment: display de anexo (document, image, audio, video).
 * Port manual de TW4→TW3; não usa oklch nem container queries nomeados.
 */
import { FileText, Music, Video, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type AttachmentType = 'image' | 'audio' | 'video' | 'document';

const iconMap: Record<AttachmentType, React.ElementType> = {
  image: ImageIcon,
  audio: Music,
  video: Video,
  document: FileText,
};

const labelMap: Record<AttachmentType, string> = {
  image: 'Imagem',
  audio: 'Áudio',
  video: 'Vídeo',
  document: 'Documento',
};

interface AttachmentProps extends React.HTMLAttributes<HTMLDivElement> {
  type: AttachmentType;
  filename?: string;
  /** URL de download/visualização. */
  href?: string;
  /** Miniatura (para image/video). */
  thumbnailUrl?: string;
}

export function Attachment({
  type,
  filename,
  href,
  thumbnailUrl,
  className,
  ...props
}: AttachmentProps) {
  const Icon = iconMap[type];
  const label = labelMap[type];

  if (type === 'image' && thumbnailUrl) {
    return (
      <div className={cn('overflow-hidden rounded-xl', className)} {...props}>
        <a href={href} target="_blank" rel="noreferrer">
          <img
            src={thumbnailUrl}
            alt={filename ?? label}
            loading="lazy"
            className="max-h-56 w-full object-cover"
          />
        </a>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-chat-received-border flex items-center gap-2 rounded-xl border bg-muted px-3 py-2',
        className
      )}
      {...props}
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        {filename ? (
          <p className="truncate text-xs font-medium">{filename}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{label}</p>
        )}
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-primary hover:underline"
          aria-label={`Abrir ${label}`}
        >
          Abrir
        </a>
      )}
    </div>
  );
}
