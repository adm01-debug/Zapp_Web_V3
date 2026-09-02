import { motion } from '@/components/ui/motion';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GenericEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

/**
 * Premium empty state component with animated icon cluster.
 * Use across all modules for consistent empty-state UX.
 */
export function GenericEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
}: GenericEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 15 }}
        className="relative mb-8"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-glow-primary">
          <Icon className="h-10 w-10 text-primary-foreground" />
        </div>
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute -right-2 -top-2 h-6 w-6 rounded-full border-4 border-background bg-accent"
        />
      </motion.div>

      <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
      <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>

      {(actionLabel || secondaryActionLabel) && (
        <div className="mt-6 flex items-center gap-3">
          {actionLabel && onAction && (
            <Button onClick={onAction} size="sm" className="gap-2">
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button onClick={onSecondaryAction} variant="outline" size="sm">
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
