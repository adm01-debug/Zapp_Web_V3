import { forwardRef } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { Menu, Search, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  onMenuOpen: () => void;
  onSearchOpen?: () => void;
  onNotificationsOpen?: () => void;
  currentView: string;
  agentName?: string;
  agentAvatar?: string;
  agentStatus?: 'online' | 'away' | 'offline';
  unreadCount?: number;
}

const viewLabels: Record<string, string> = {
  inbox: 'Conversas',
  dashboard: 'Dashboard',
  contacts: 'Contatos',
  agents: 'Equipe',
  groups: 'Grupos',
  queues: 'Filas',
  connections: 'Conexões',
  campaigns: 'Campanhas',
  chatbot: 'Chatbot',
  pipeline: 'Pipeline',
  wallet: 'Carteira',
  catalog: 'Catálogo',
  payments: 'Pagamentos',
  tags: 'Etiquetas',
  knowledge: 'Base de Conhecimento',
  automations: 'Automações',
  reports: 'Relatórios',
  settings: 'Configurações',
  security: 'Segurança',
  admin: 'Admin',
};

/** Mobile Header component for the mobile section. */
export const MobileHeader = forwardRef<HTMLElement, MobileHeaderProps>(function MobileHeader(
  {
    onMenuOpen,
    onSearchOpen,
    onNotificationsOpen,
    currentView,
    agentName,
    agentAvatar,
    agentStatus = 'online',
    unreadCount = 0,
  },
  ref
) {
  const initials =
    agentName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2) || 'U';

  return (
    <motion.header
      ref={ref}
      initial={{ y: -48 }}
      animate={{ y: 0 }}
      className="safe-area-top fixed left-0 right-0 top-0 z-50"
    >
      <div className="flex h-14 items-center justify-between border-b border-border/10 bg-background/80 px-4 shadow-sm backdrop-blur-2xl">
        {/* Left: Menu + Avatar */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 touch-manipulation rounded-xl active:scale-95"
            onClick={onMenuOpen}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </Button>

          <div className="relative">
            <Avatar className="h-8 w-8 shadow-sm">
              <AvatarImage src={agentAvatar} alt={agentName} />
              <AvatarFallback className="bg-primary/15 text-[9px] font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-card',
                agentStatus === 'online' && 'bg-[hsl(var(--online,142_71%_45%))]',
                agentStatus === 'away' && 'bg-[hsl(var(--away,38_92%_50%))]',
                agentStatus === 'offline' && 'bg-muted-foreground/50'
              )}
            />
          </div>
        </div>

        {/* Center: View title */}
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          <motion.h1
            key={currentView}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[180px] truncate font-display text-[15px] font-black tracking-tight text-foreground"
          >
            {viewLabels[currentView] || currentView.charAt(0).toUpperCase() + currentView.slice(1)}
          </motion.h1>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5">
          {onSearchOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 touch-manipulation rounded-xl active:scale-95"
              onClick={onSearchOpen}
              aria-label="Buscar"
            >
              <Search className="h-[18px] w-[18px] text-muted-foreground" />
            </Button>
          )}

          {onNotificationsOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="relative h-10 w-10 touch-manipulation rounded-xl active:scale-95"
              onClick={onNotificationsOpen}
              aria-label="Notificações"
            >
              <Bell className="h-[18px] w-[18px] text-muted-foreground" />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute right-1.5 top-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          )}
        </div>
      </div>
    </motion.header>
  );
});
