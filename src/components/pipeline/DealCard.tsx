import { motion } from '@/components/ui/motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DollarSign, Calendar, User, MoreHorizontal, Trophy, Edit, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  stage_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  priority: string;
  expected_close_date: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  created_at: string;
  contact?: { name: string; phone: string } | null;
  assignee?: { name: string } | null;
}

const priorityColors: Record<string, string> = {
  high: 'bg-destructive/20 text-destructive border-destructive/30',
  medium: 'bg-warning/20 text-warning border-warning/30',
  low: 'bg-success/20 text-success border-success/30',
};

// Date-only values ("YYYY-MM-DD") from <input type="date"> are parsed by JS as
// midnight UTC, which shifts to the previous day in negative-offset timezones
// (e.g. UTC-3). Parse the calendar parts as a local date to display the intended day.
function formatCloseDate(value: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return date.toLocaleDateString('pt-BR');
}

interface DealCardProps {
  deal: Deal;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onEdit: (deal: Deal) => void;
  onMarkWon: (deal: Deal) => void;
  onMarkLost: (deal: Deal) => void;
  onDelete: (id: string) => void;
}

/** Deal Card component for the pipeline section. */
export function DealCard({
  deal,
  isDragging,
  onDragStart,
  onDragEnd,
  onEdit,
  onMarkWon,
  onMarkLost,
  onDelete,
}: DealCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group cursor-grab rounded-lg border bg-card/80 p-3 transition-all hover:border-secondary/30 hover:shadow-sm active:cursor-grabbing',
        isDragging && 'scale-95 opacity-50'
      )}
    >
      <div className="mb-2 flex items-start justify-between">
        <h4 className="text-sm font-medium leading-tight text-foreground">{deal.title}</h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Opções do deal"
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(deal)}>
              <Edit className="mr-2 h-3.5 w-3.5" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMarkWon(deal)} className="text-success">
              <Trophy className="mr-2 h-3.5 w-3.5" /> Marcar como ganho
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMarkLost(deal)} className="text-destructive">
              <X className="mr-2 h-3.5 w-3.5" /> Marcar como perdido
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(deal.id)} className="text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {deal.value > 0 && (
        <div className="mb-2 flex items-center gap-1">
          <DollarSign className="h-3.5 w-3.5 text-success" />
          <span className="text-sm font-semibold text-success">
            R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('h-4 text-[10px]', priorityColors[deal.priority])}>
          {deal.priority === 'high' ? 'Alta' : deal.priority === 'medium' ? 'Média' : 'Baixa'}
        </Badge>
        {deal.contact && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="max-w-[80px] truncate">{deal.contact.name}</span>
          </div>
        )}
        {deal.expected_close_date && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatCloseDate(deal.expected_close_date)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Re-exported module members. */
export type { Deal };
