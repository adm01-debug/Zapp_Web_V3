import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Edit2, Trash2, Copy, Play, ArrowRight } from 'lucide-react';
import { Zap } from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { TRIGGER_TYPES, ACTION_TYPES } from './automationConstants';
import type { AutomationRow } from '@/hooks/useAutomationManagement';

interface AutomationCardProps {
  automation: AutomationRow;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

/** Automation Card component for the automations section. */
export function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
}: AutomationCardProps) {
  const triggerInfo = TRIGGER_TYPES.find((t) => t.type === automation.trigger_type);
  const TriggerIcon = triggerInfo?.icon || Zap;
  const actions = Array.isArray(automation.actions) ? automation.actions : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-lg border p-4 transition-all',
        automation.is_active ? 'border-primary/20 bg-card' : 'border-border bg-muted/30 opacity-70'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'shrink-0 rounded-lg p-2',
            automation.is_active ? 'bg-primary/20' : 'bg-muted'
          )}
        >
          <TriggerIcon
            className={cn(
              'h-5 w-5',
              automation.is_active ? 'text-primary' : 'text-muted-foreground'
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-medium">{automation.name}</h4>
            <Badge variant={automation.is_active ? 'default' : 'secondary'} className="text-xs">
              {automation.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {automation.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="text-xs">
              {triggerInfo?.label}
            </Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            {actions.map((action: Record<string, unknown>, i: number) => {
              const actionInfo = ACTION_TYPES.find((a) => a.type === action.type);
              return (
                <Badge key={`${String(action.type)}-${i}`} variant="secondary" className="text-xs">
                  {actionInfo?.label}
                </Badge>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" />
              {automation.execution_count}x executado
            </span>
            {automation.last_executed_at && (
              <span>
                Último: {new Date(automation.last_executed_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch checked={automation.is_active} onCheckedChange={onToggle} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
            aria-label="Editar automação"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onDuplicate}
            aria-label="Duplicar automação"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={onDelete}
            aria-label="Excluir automação"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
