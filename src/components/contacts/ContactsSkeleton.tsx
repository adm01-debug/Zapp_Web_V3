import { motion } from '@/components/ui/motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ContactViewMode } from './ContactViewSwitcher';

const GRID_COLUMNS_CLASS: Record<number, string> = {
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
};

interface ContactsSkeletonProps {
  viewMode: ContactViewMode;
  gridColumns: number;
}

/** Contacts Skeleton component for the contacts section. */
export function ContactsSkeleton({ viewMode, gridColumns }: ContactsSkeletonProps) {
  if (viewMode === 'kanban') {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="w-72 shrink-0 space-y-3 rounded-xl border border-border/30 p-3">
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            {Array.from({ length: 3 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: (col * 3 + i) * 0.04 }}
                className="space-y-2 rounded-lg border border-border/20 p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-3 w-32 animate-pulse rounded bg-muted/50" />
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'analytics') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="space-y-4 rounded-xl border border-border/30 p-5"
          >
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
            <div className="h-40 animate-pulse rounded-lg bg-muted/40" />
          </motion.div>
        ))}
      </div>
    );
  }

  if (viewMode === 'map') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[500px] animate-pulse items-center justify-center rounded-xl border border-border/30 bg-muted/20"
      >
        <div className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-muted/50" />
          <div className="mx-auto h-4 w-32 animate-pulse rounded bg-muted/40" />
        </div>
      </motion.div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className={cn('grid gap-4', GRID_COLUMNS_CLASS[gridColumns] || GRID_COLUMNS_CLASS[4])}>
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="space-y-4 rounded-2xl border border-border/30 p-5"
          >
            <div className="h-1 w-full animate-pulse rounded bg-muted/60" />
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
              </div>
            </div>
            <div className="h-12 animate-pulse rounded-xl bg-muted/40" />
          </motion.div>
        ))}
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-4 rounded-xl border border-border/30 px-4 py-3"
          >
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted/50" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  // Table skeleton
  return (
    <Card className="overflow-hidden border-border/30 shadow-none">
      <div className="flex h-10 items-center gap-4 border-b border-border/20 bg-muted/20 px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn('h-3 animate-pulse rounded bg-muted/60', i === 0 ? 'w-10' : 'flex-1')}
          />
        ))}
      </div>
      <CardContent className="p-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-4 border-b border-border/10 p-4 last:border-0"
          >
            <div className="h-5 w-5 shrink-0 animate-pulse rounded bg-muted" />
            <div className="flex min-w-[200px] flex-1 items-center gap-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
              </div>
            </div>
            <div className="hidden h-4 w-24 flex-1 animate-pulse rounded bg-muted/40 md:block" />
            <div className="hidden h-4 w-32 flex-1 animate-pulse rounded bg-muted/40 lg:block" />
            <div className="hidden h-4 w-28 flex-1 animate-pulse rounded bg-muted/40 xl:block" />
            <div className="h-8 w-10 shrink-0 animate-pulse rounded bg-muted/30" />
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
