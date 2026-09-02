import { useState, useRef } from 'react';
import { motion } from '@/components/ui/motion';
import { X, Download, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VideoFullscreenProps {
  url: string;
  onClose: () => void;
}

/** Video Fullscreen component. */
export function VideoFullscreen({ url, onClose }: VideoFullscreenProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    setPlaybackRate(newRate);
    if (videoRef.current) videoRef.current.playbackRate = newRate;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
            variant="secondary"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted(!isMuted);
            }}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary"
            size="sm"
            className={cn(
              'h-9 px-3 text-xs font-semibold',
              playbackRate < 1 && 'bg-destructive/20 text-destructive hover:bg-destructive/30'
            )}
            onClick={(e) => {
              e.stopPropagation();
              cycleSpeed();
            }}
          >
            {playbackRate}x
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            aria-label="Download bloqueado"
            variant="secondary"
            size="icon"
            disabled
            className="cursor-not-allowed opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              import('sonner').then(({ toast }) =>
                toast.error('🔒 Download bloqueado por política de segurança')
              );
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button aria-label="Fechar vídeo" variant="secondary" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      </div>

      <video
        ref={videoRef}
        src={url}
        controls
        controlsList="nodownload"
        autoPlay
        muted={isMuted}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onLoadedMetadata={() => {
          if (videoRef.current) videoRef.current.playbackRate = playbackRate;
        }}
        className="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl"
      />
      <p className="sr-only">
        Legendas não disponíveis para conteúdo de vídeo gerado pelos usuários.
      </p>
    </motion.div>
  );
}
