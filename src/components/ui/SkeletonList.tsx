import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from '@/components/ui/motion';

interface SkeletonListProps {
  /** Number of skeleton rows */
  count?: number;
  /** Layout variant */
  variant?: 'list' | 'card' | 'table';
  /** Additional classes */
  className?: string;
}

const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  },
};

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-muted/60', className)} />;
}

/** Skeleton List function. */
export function SkeletonList({ count = 5, variant = 'list', className }: SkeletonListProps) {
  if (variant === 'card') {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
      >
        {Array.from({ length: count }).map((_, i) => (
          <motion.div
            key={i}
            variants={staggerItem}
            className="space-y-3 rounded-xl border border-border/40 p-4"
          >
            <div className="flex items-center gap-3">
              <SkeletonPulse className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <SkeletonPulse className="h-3.5 w-3/4" />
                <SkeletonPulse className="h-2.5 w-1/2" />
              </div>
            </div>
            <SkeletonPulse className="h-16 w-full" />
            <div className="flex gap-2">
              <SkeletonPulse className="h-6 w-16 rounded-full" />
              <SkeletonPulse className="h-6 w-20 rounded-full" />
            </div>
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (variant === 'table') {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className={cn('space-y-1', className)}
      >
        {/* Header */}
        <div className="flex gap-4 border-b border-border/30 px-4 py-2">
          <SkeletonPulse className="h-3 w-24" />
          <SkeletonPulse className="h-3 w-32" />
          <SkeletonPulse className="h-3 w-20" />
          <SkeletonPulse className="ml-auto h-3 w-16" />
        </div>
        {Array.from({ length: count }).map((_, i) => (
          <motion.div
            key={i}
            variants={staggerItem}
            className="flex items-center gap-4 border-b border-border/20 px-4 py-3"
          >
            <SkeletonPulse className="h-8 w-8 shrink-0 rounded-full" />
            <SkeletonPulse className="h-3.5 w-28" />
            <SkeletonPulse className="h-3 w-40" />
            <SkeletonPulse className="h-3 w-20" />
            <SkeletonPulse className="ml-auto h-6 w-16 rounded-full" />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  // Default: list
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={cn('space-y-2', className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          variants={staggerItem}
          className="flex items-center gap-3 rounded-xl border border-border/30 p-3"
        >
          <SkeletonPulse className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <SkeletonPulse className="h-3.5 w-2/5" />
            <SkeletonPulse className="h-2.5 w-3/5" />
          </div>
          <SkeletonPulse className="h-5 w-12 rounded-full" />
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Stagger-in wrapper for any list of children */
export function StaggerList({
  children,
  className,
  delay = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: delay } },
      }}
      className={className}
    >
      {React.Children.map(children, (child) => (
        <motion.div variants={staggerItem}>{child}</motion.div>
      ))}
    </motion.div>
  );
}
