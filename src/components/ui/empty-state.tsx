import { motion } from '@/components/ui/motion';
import { LucideIcon, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { illustrations } from './empty-state-illustrations';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  illustration?: keyof typeof illustrations;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: {
    container: 'py-4',
    illustration: 'w-20 h-16',
    icon: 'w-4 h-4',
    iconContainer: 'w-8 h-8',
    title: 'text-[13px]',
    description: 'text-[11px]',
  },
  sm: {
    container: 'py-6',
    illustration: 'w-28 h-22',
    icon: 'w-10 h-10',
    iconContainer: 'w-14 h-14',
    title: 'text-base',
    description: 'text-sm',
  },
  md: {
    container: 'py-10',
    illustration: 'w-44 h-36',
    icon: 'w-7 h-7',
    iconContainer: 'w-14 h-14',
    title: 'text-lg',
    description: 'text-base',
  },
  lg: {
    container: 'py-16',
    illustration: 'w-56 h-44',
    icon: 'w-8 h-8',
    iconContainer: 'w-16 h-16',
    title: 'text-xl',
    description: 'text-base',
  },
};

/** Empty State component for the ui section. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  illustration,
  size = 'md',
  className,
}: EmptyStateProps) {
  const sizes = sizeClasses[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizes.container,
        className
      )}
    >
      {illustration && illustrations[illustration] ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className={cn('relative mb-6', sizes.illustration)}
        >
          {illustrations[illustration]}
          <div className="absolute inset-0 -z-10 blur-3xl">
            <div className="h-full w-full rounded-full bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
          </div>
        </motion.div>
      ) : null}

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 0.3, type: 'spring', stiffness: 200 }}
        className={cn('mb-4 flex items-center justify-center rounded-2xl', sizes.iconContainer)}
        style={{ background: 'var(--gradient-primary)' }}
      >
        <Icon className={cn('text-primary-foreground', sizes.icon)} />
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className={cn('mb-2 font-display font-semibold text-foreground', sizes.title)}
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
        className={cn('mb-6 max-w-md text-muted-foreground', sizes.description)}
      >
        {description}
      </motion.p>

      {(actionLabel || secondaryActionLabel) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          className="flex flex-col items-center gap-3 sm:flex-row"
        >
          {actionLabel && onAction && (
            <Button
              onClick={onAction}
              size={size === 'sm' ? 'sm' : 'default'}
              className="group shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {actionLabel}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button
              variant="ghost"
              onClick={onSecondaryAction}
              size={size === 'sm' ? 'sm' : 'default'}
              className="text-muted-foreground hover:text-foreground"
            >
              {secondaryActionLabel}
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
