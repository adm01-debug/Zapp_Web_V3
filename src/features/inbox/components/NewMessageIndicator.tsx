import { motion, AnimatePresence } from '@/components/ui/motion';
import { MessageSquare, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useContactAvatar } from '@/features/inbox';

interface NewMessageIndicatorProps {
  show: boolean;
  contactId?: string | null;
  contactName: string;
  contactAvatar?: string | null;
  message: string;
  onView: () => void;
  onDismiss: () => void;
}

/** New Message Indicator component. */
export function NewMessageIndicator({
  show,
  contactId,
  contactName,
  contactAvatar,
  message,
  onView,
  onDismiss,
}: NewMessageIndicatorProps) {
  const { avatarUrl } = useContactAvatar(contactId, contactAvatar);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed right-4 top-20 z-[100] max-w-sm"
        >
          <motion.div
            className={cn(
              'relative overflow-hidden rounded-xl border border-primary/30',
              'bg-card/95 shadow-2xl backdrop-blur-md',
              'shadow-primary/20'
            )}
            whileHover={{ scale: 1.02 }}
          >
            {/* Animated background glow */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20"
              animate={{
                x: ['-100%', '100%'],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'linear',
              }}
            />

            {/* Pulsing border effect */}
            <motion.div
              className="absolute inset-0 rounded-xl border-2 border-primary/50"
              animate={{
                opacity: [0.5, 1, 0.5],
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            <div className="relative p-4">
              <div className="flex items-start gap-3">
                {/* Avatar with pulse animation */}
                <div className="relative">
                  <motion.div
                    className="absolute -inset-1 rounded-full bg-primary/30"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                    }}
                  />
                  <Avatar className="h-12 w-12 ring-2 ring-primary/50">
                    <AvatarImage
                      src={avatarUrl || undefined}
                      alt={contactName}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).removeAttribute('src');
                      }}
                    />
                    <AvatarFallback className="bg-primary/20 font-semibold text-primary">
                      {contactName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  {/* New message badge */}
                  <motion.div
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    <MessageSquare className="h-3 w-3 text-primary-foreground" />
                  </motion.div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <motion.p
                      className="font-semibold text-foreground"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      {contactName}
                    </motion.p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-muted/50"
                      onClick={onDismiss}
                      aria-label="Dispensar notificação"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <motion.p
                    className="truncate text-sm text-muted-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {message}
                  </motion.p>
                </div>
              </div>

              {/* Action buttons */}
              <motion.div
                className="mt-3 flex gap-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Button
                  size="sm"
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={onView}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Ver mensagem
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border/50"
                  onClick={onDismiss}
                >
                  Depois
                </Button>
              </motion.div>
            </div>

            {/* Auto-dismiss progress bar */}
            <motion.div
              className="h-1 bg-primary/50"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 8, ease: 'linear' }}
              onAnimationComplete={onDismiss}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
