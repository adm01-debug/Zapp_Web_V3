import { motion, AnimatePresence } from '@/components/ui/motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Keyboard, MessageSquare, Navigation, Zap, MousePointerClick, Search } from 'lucide-react';
import { useCustomShortcuts, type ShortcutBinding } from '@/hooks/useCustomShortcuts';
import { cn } from '@/lib/utils';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryConfig = {
  chat: {
    icon: MessageSquare,
    label: 'Chat',
    description: 'Atalhos para mensagens',
    gradient: 'from-info/20 to-info/10',
  },
  navigation: {
    icon: Navigation,
    label: 'Navegação',
    description: 'Navegar pela aplicação',
    gradient: 'from-primary/20 to-primary/10',
  },
  actions: {
    icon: Zap,
    label: 'Ações Rápidas',
    description: 'Executar ações comuns',
    gradient: 'from-warning/20 to-warning/10',
  },
  selection: {
    icon: MousePointerClick,
    label: 'Seleção',
    description: 'Gerenciar seleções',
    gradient: 'from-success/20 to-success/10',
  },
};

const additionalShortcuts = [
  { keys: ['?'], description: 'Mostrar esta ajuda', category: 'global' },
  { keys: ['Esc'], description: 'Fechar diálogos e modais', category: 'global' },
  { keys: ['Ctrl', 'K'], description: 'Busca global', category: 'global' },
  { keys: ['G', 'H'], description: 'Ir para Home', category: 'navigation' },
  { keys: ['G', 'I'], description: 'Ir para Inbox', category: 'navigation' },
  { keys: ['G', 'S'], description: 'Ir para Configurações', category: 'navigation' },
];

function ShortcutKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[28px] items-center justify-center rounded-md border border-border bg-muted/80 px-2 py-1 text-xs font-semibold text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutBinding }) {
  const { formatShortcut } = useCustomShortcuts();
  const keys = formatShortcut(shortcut);
  const isCustomized = !!shortcut.customKey;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="group flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-sm text-foreground">{shortcut.name}</span>
        {isCustomized && (
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px] opacity-60 group-hover:opacity-100"
          >
            Personalizado
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {keys.map((key, index) => (
          <span key={`${key}-${index}`} className="flex items-center">
            <ShortcutKey>{key}</ShortcutKey>
            {index < keys.length - 1 && (
              <span className="mx-1 text-xs text-muted-foreground">+</span>
            )}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function CategorySection({
  category,
  shortcuts,
}: {
  category: keyof typeof categoryConfig;
  shortcuts: ShortcutBinding[];
}) {
  const config = categoryConfig[category];
  const Icon = config.icon;

  if (shortcuts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div
        className={cn('flex items-center gap-3 rounded-xl bg-gradient-to-r p-3', config.gradient)}
      >
        <div className="rounded-lg bg-background/80 p-2 backdrop-blur-sm">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{config.label}</h3>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </div>
      <div className="space-y-0.5 pl-2">
        {shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.id} shortcut={shortcut} />
        ))}
      </div>
    </motion.div>
  );
}

/** Keyboard Shortcuts Dialog component for the keyboard section. */
export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const { shortcuts } = useCustomShortcuts();

  const groupedShortcuts = {
    chat: shortcuts.filter((s) => s.category === 'chat'),
    navigation: shortcuts.filter((s) => s.category === 'navigation'),
    actions: shortcuts.filter((s) => s.category === 'actions'),
    selection: shortcuts.filter((s) => s.category === 'selection'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2">
              <Keyboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Atalhos de Teclado</DialogTitle>
              <DialogDescription>
                Use atalhos para trabalhar mais rápido. Pressione <ShortcutKey>?</ShortcutKey> a
                qualquer momento para ver esta ajuda.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            <AnimatePresence>
              {Object.entries(groupedShortcuts).map(([category, categoryShortcuts], index) => (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <CategorySection
                    category={category as keyof typeof categoryConfig}
                    shortcuts={categoryShortcuts}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Additional Tips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="border-t border-border pt-4"
            >
              <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Search className="h-4 w-4" />
                Atalhos Globais
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {additionalShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between rounded-lg bg-muted/30 p-2"
                  >
                    <span className="text-xs text-muted-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-0.5">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={`${key}-${keyIndex}`} className="flex items-center">
                          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="mx-0.5 text-[10px] text-muted-foreground">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Pro Tip */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/20 p-1.5">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium">Dica Pro</h4>
                  <p className="text-xs text-muted-foreground">
                    Você pode personalizar qualquer atalho em{' '}
                    <span className="font-medium text-foreground">
                      Configurações → Atalhos de Teclado
                    </span>
                    . Clique em "Editar" ao lado de qualquer atalho para alterá-lo.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
