import { SLARule, SLARuleScope, SLARuleMetadata } from '@/features/sla';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, Target, Edit2, Trash2, Bell } from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { formatSLAMinutes } from './sla-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface SLARuleRowProps {
  rule: SLARule;
  scope: SLARuleScope;
  scopeLabel?: string;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (active: boolean) => void;
}

/** SLARule Row component for the settings section. */
export function SLARuleRow({
  rule,
  scope,
  scopeLabel,
  index,
  onEdit,
  onDelete,
  onToggle,
}: SLARuleRowProps) {
  const fallbackLabel =
    scope === 'contact'
      ? rule.contact_id?.slice(0, 8) + '…'
      : scope === 'company'
        ? rule.company
        : scope === 'job_title'
          ? rule.job_title
          : scope === 'contact_type'
            ? rule.contact_type
            : scope === 'queue'
              ? rule.queue_id?.slice(0, 8) + '…'
              : rule.agent_id?.slice(0, 8) + '…';

  const displayLabel = scopeLabel || fallbackLabel;
  const meta = (rule.metadata || {}) as SLARuleMetadata;
  const hasEscalation = meta.notify_on_warning || !!meta.escalation_notes;

  return (
    <motion.div
      role="listitem"
      aria-label={`Regra SLA: ${rule.name}, ${rule.is_active ? 'ativa' : 'inativa'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className="flex items-center gap-3 rounded-xl border border-transparent bg-muted/30 px-4 py-3 transition-all duration-200 hover:border-border/50 hover:bg-muted/50"
    >
      <Switch
        checked={rule.is_active}
        onCheckedChange={onToggle}
        aria-label={`Ativar/desativar regra ${rule.name}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{rule.name}</span>
          <Badge variant="outline" className="text-[10px]">
            P{rule.priority}
          </Badge>
          {displayLabel && (
            <Badge variant="secondary" className="max-w-[150px] truncate text-[10px]">
              {displayLabel}
            </Badge>
          )}
          {hasEscalation && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-warning/20">
                    <Bell className="h-2.5 w-2.5 text-warning" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px] text-xs">
                  {meta.notify_on_warning && <p>Notifica ao atingir aviso</p>}
                  {meta.escalation_notes && (
                    <p className="mt-0.5 text-muted-foreground">{meta.escalation_notes}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> 1ª Resp:{' '}
            <span className="font-medium text-foreground/80">
              {formatSLAMinutes(rule.first_response_minutes)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Target className="h-3 w-3" /> Resolução:{' '}
            <span className="font-medium text-foreground/80">
              {formatSLAMinutes(rule.resolution_minutes)}
            </span>
          </span>
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-xl hover:bg-primary/10"
        onClick={onEdit}
        aria-label={`Editar regra ${rule.name}`}
      >
        <Edit2 className="h-3.5 w-3.5" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Excluir regra ${rule.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra de SLA</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a regra <strong>"{rule.name}"</strong>? Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
