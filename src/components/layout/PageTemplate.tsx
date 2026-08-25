import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from '@/components/ui/motion';

interface PageTemplateProps {
  /** Page title (H1) */
  title: string;
  /** Optional subtitle / description */
  subtitle?: string;
  /** Icon shown next to title */
  icon?: React.ReactNode;
  /** Action buttons (top-right) */
  actions?: React.ReactNode;
  /** Filter/search bar row */
  filters?: React.ReactNode;
  /** Main page content */
  children: React.ReactNode;
  /** Extra classNames for the content area */
  className?: string;
  /** Whether content should have padding (default true) */
  padded?: boolean;
  /** Whether to use full-bleed (no max-width) */
  fullBleed?: boolean;
}

const easeSmooth = [0.4, 0, 0.2, 1] as const;

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: easeSmooth as unknown as [number, number, number, number], // ignore-audit — framer-motion easing type is string | number[] but easeSmooth is a named function reference
      staggerChildren: 0.06,
    },
  },
};

const childVariants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easeSmooth as unknown as [number, number, number, number] }, // ignore-audit — framer-motion easing type is string | number[] but easeSmooth is a named function reference
  },
};

/** Page Template function. */
export function PageTemplate({
  title,
  subtitle,
  icon,
  actions,
  filters,
  children,
  className,
  padded = true,
  fullBleed = false,
}: PageTemplateProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className={cn('flex h-full w-full flex-col overflow-hidden', !fullBleed && 'max-w-full')}
    >
      {/* ─── Header ─── */}
      <motion.header
        variants={childVariants}
        className={cn(
          'flex shrink-0 flex-col gap-3 border-b border-border/40 bg-card',
          padded ? 'px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5' : 'px-4 pb-3 pt-4'
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {/* Title block */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-fluid-lg font-bold leading-tight tracking-tight text-foreground sm:text-fluid-xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-0.5 truncate text-fluid-xs leading-normal text-muted-foreground sm:text-fluid-sm">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {/* Filters row */}
        {filters && (
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            {filters}
          </div>
        )}
      </motion.header>

      {/* ─── Content ─── */}
      <motion.div
        variants={childVariants}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overflow-x-hidden',
          padded && 'p-[var(--density-padding-x)] sm:p-[calc(var(--density-padding-x)*1.5)]',
          className
        )}
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 500px' }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
