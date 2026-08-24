import { ReactNode } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ToolPanelProps {
  isOpen: boolean;
  onClose: () => void;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}

/** Tool Panel component for the ai tools section. */
export function ToolPanel({
  isOpen,
  onClose,
  icon,
  title,
  subtitle,
  children,
  className,
  headerRight,
}: ToolPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop translúcido */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 bg-foreground/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Modal centralizado */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={cn(
              'absolute left-2 right-2 z-30 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl',
              'top-[15%] mx-auto max-h-[70%] max-w-[470px]',
              className
            )}
          >
            {/* Header padronizado */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
                {subtitle && (
                  <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
                )}
              </div>
              {headerRight}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                aria-label="Fechar painel"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Corpo com scroll */}
            <ScrollArea className="flex-1">
              <div className="p-5">{children}</div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
