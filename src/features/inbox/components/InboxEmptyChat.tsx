import { motion } from '@/components/ui/motion';
import { MessageSquare, MessageSquarePlus, Search as SearchIcon } from 'lucide-react';

/** Inbox Empty Chat component. */
export function InboxEmptyChat() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-lg p-8 text-center"
      >
        <div className="relative mx-auto mb-6 h-20 w-20">
          <motion.div
            animate={{ rotate: [0, 3, -3, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent shadow-2xl shadow-primary/10 ring-1 ring-primary/10"
          >
            <MessageSquare className="h-8 w-8 text-primary/50" />
          </motion.div>
          <motion.div
            animate={{ y: [0, -8, 0], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 shadow-sm ring-1 ring-primary/10"
          >
            <MessageSquarePlus className="h-4 w-4 text-primary/60" />
          </motion.div>
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute -bottom-2 -left-2 flex h-7 w-7 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/10"
          >
            <SearchIcon className="h-3.5 w-3.5 text-accent-foreground/50" />
          </motion.div>
        </div>

        <h3 className="mb-2 text-[18px] font-bold tracking-tight text-foreground">
          Sua central de atendimento
        </h3>
        <p className="mb-8 text-[14px] leading-relaxed text-muted-foreground">
          Selecione uma conversa na lista para começar. Utilize os atalhos de teclado para uma
          navegação ultra-rápida.
        </p>

        <div className="inline-flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-border/10 bg-card px-6 py-4 shadow-xl shadow-primary/5">
          <div className="flex items-center gap-1">
            <kbd className="rounded-md border border-border/40 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
              ↑
            </kbd>
            <kbd className="rounded-md border border-border/40 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
              ↓
            </kbd>
            <span className="ml-1 text-[10px] text-muted-foreground/60">navegar</span>
          </div>
          <div className="h-3 w-px bg-border/40" />
          <div className="flex items-center gap-1">
            <kbd className="rounded-md border border-border/40 bg-muted px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
              Enter
            </kbd>
            <span className="ml-1 text-[10px] text-muted-foreground/60">abrir</span>
          </div>
          <div className="h-3 w-px bg-border/40" />
          <div className="flex items-center gap-1">
            <kbd className="rounded-md border border-border/40 bg-muted px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
              ⌘K
            </kbd>
            <span className="ml-1 text-[10px] text-muted-foreground/60">buscar</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
