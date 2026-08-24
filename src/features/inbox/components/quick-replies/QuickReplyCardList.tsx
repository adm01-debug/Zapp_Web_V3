import { motion, AnimatePresence } from '@/components/ui/motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Trash2, Edit2, Copy, Clock, TrendingUp, Sparkles } from 'lucide-react';
import { QuickReplyTemplate } from '@/features/inbox';
import { cn } from '@/lib/utils';

interface QuickReplyCardListProps {
  templates: QuickReplyTemplate[];
  groupedByCategory: Record<string, QuickReplyTemplate[]>;
  isLoading: boolean;
  activeTab: string;
  searchQuery: string;
  isFavorite: (id: string) => boolean;
  onSelect: (template: QuickReplyTemplate) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (content: string) => void;
  onEdit: (template: QuickReplyTemplate) => void;
  onDelete: (id: string) => void;
  onShowCreate: () => void;
}

/** Quick Reply Card List component for the quick replies section. */
export function QuickReplyCardList({
  templates,
  groupedByCategory,
  isLoading,
  activeTab,
  searchQuery,
  isFavorite,
  onSelect,
  onToggleFavorite,
  onCopy,
  onEdit,
  onDelete,
  onShowCreate,
}: QuickReplyCardListProps) {
  if (isLoading) {
    return (
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      </ScrollArea>
    );
  }

  if (templates.length === 0) {
    return (
      <ScrollArea className="h-[400px] pr-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">
            {activeTab === 'favorites'
              ? 'Nenhuma resposta favorita ainda'
              : searchQuery
                ? 'Nenhum resultado encontrado'
                : 'Nenhuma resposta criada'}
          </p>
          {activeTab !== 'favorites' && !searchQuery && (
            <Button variant="outline" size="sm" className="mt-4" onClick={onShowCreate}>
              Criar primeira resposta
            </Button>
          )}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-4">
        {Object.entries(groupedByCategory).map(([category, items]) => (
          <div key={category}>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {category}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {items.map((template) => (
                  <motion.div
                    key={template.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={cn(
                      'group cursor-pointer rounded-xl border border-border/50 bg-card p-3 transition-all hover:border-primary/30',
                      isFavorite(template.id) && 'border-warning/30 bg-warning/5'
                    )}
                    onClick={() => onSelect(template)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="truncate font-medium">{template.title}</span>
                          {template.shortcut && (
                            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                              {template.shortcut}
                            </kbd>
                          )}
                        </div>
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {template.content}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {template.use_count || 0} usos
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(template.updated_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          aria-label="Favoritar resposta rápida"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(template.id);
                          }}
                        >
                          <Star
                            className={cn(
                              'h-4 w-4',
                              isFavorite(template.id) && 'fill-yellow-400 text-warning'
                            )}
                          />
                        </Button>
                        <Button
                          aria-label="Copiar conteúdo"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopy(template.content);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label="Editar resposta rápida"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(template);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label="Excluir resposta rápida"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(template.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
