import { X, Archive, Forward, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDensity } from '@/hooks/useDensity';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from '@/components/ui/motion';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onMarkAsRead: () => void;
  onArchive: () => void;
  onClearSelection: () => void;
  isLoading?: boolean;
}

/** Bulk Actions Toolbar component. */
export function BulkActionsToolbar({
  selectedCount,
  onMarkAsRead,
  onArchive,
  onClearSelection,
  isLoading = false,
}: BulkActionsToolbarProps) {
  const { density } = useDensity();
  const isCompact = density === 'compact' || density === 'dense';

  if (selectedCount === 0) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn(
            'absolute left-0 right-0 top-0 z-20 border-b border-primary-foreground/20 bg-primary/95 backdrop-blur-sm transition-all',
            isCompact ? 'p-1.5' : 'p-3'
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClearSelection}
                    className={cn(
                      'text-primary-foreground hover:bg-primary-foreground/20',
                      isCompact ? 'h-7 w-7' : 'h-8 w-8'
                    )}
                    aria-label="Limpar seleção"
                  >
                    <X className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Limpar seleção (Esc)</TooltipContent>
              </Tooltip>
              <Badge
                variant="secondary"
                className={cn(
                  'border-0 bg-primary-foreground/20 font-bold text-primary-foreground',
                  isCompact ? 'h-4.5 px-1.5 text-[9px]' : 'h-5 px-2 text-[11px]'
                )}
              >
                {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onMarkAsRead}
                    disabled={isLoading}
                    className={cn(
                      'gap-2 font-bold text-primary-foreground hover:bg-primary-foreground/20',
                      isCompact ? 'h-7 text-[10px]' : 'h-8 text-[11px]'
                    )}
                    aria-label="Marcar como lido"
                  >
                    <CheckCheck className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                    <span className="hidden sm:inline">Marcar como lido</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Marcar como lido (R)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled
                      className={cn(
                        'gap-2 font-bold text-primary-foreground',
                        isCompact ? 'h-7 text-[10px]' : 'h-8 text-[11px]'
                      )}
                      aria-label="Transferência em massa indisponível"
                    >
                      <Forward className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                      <span className="hidden sm:inline">Transferir</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Transferência em massa temporariamente indisponível até concluir a trilha de
                  auditoria.
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onArchive}
                    disabled={isLoading}
                    className={cn(
                      'gap-2 font-bold text-primary-foreground hover:bg-primary-foreground/20',
                      isCompact ? 'h-7 text-[10px]' : 'h-8 text-[11px]'
                    )}
                    aria-label="Arquivar"
                  >
                    <Archive className={cn(isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                    <span className="hidden sm:inline">Arquivar</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="flex items-center gap-1.5">
                    Arquivar selecionados
                    <kbd className="rounded bg-muted/50 px-1 py-0.5 text-[10px]">Del</kbd>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Você pode desfazer em 5s</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
