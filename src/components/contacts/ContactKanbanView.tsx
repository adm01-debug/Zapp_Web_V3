import { useState, useMemo, useCallback, type HTMLAttributes } from 'react';
import { motion } from '@/components/ui/motion';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MessageSquare,
  Users,
  UserCheck,
  Truck,
  Wrench,
  Star,
  Handshake,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatarColors';
import { toast } from 'sonner';
import { dbFrom } from '@/integrations/datasource/db';

interface KanbanContact {
  id: string;
  name: string;
  surname?: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  avatar_url?: string | null;
  contact_type?: string | null;
  tags?: string[] | null;
}

interface ContactKanbanViewProps {
  contacts: KanbanContact[];
  onContactClick: (id: string) => void;
}

const KANBAN_COLUMNS = [
  { type: 'lead', label: 'Leads', color: 'hsl(38, 92%, 50%)', icon: Star },
  { type: 'cliente', label: 'Clientes', color: 'hsl(217, 91%, 60%)', icon: Users },
  { type: 'fornecedor', label: 'Fornecedores', color: 'hsl(270, 60%, 60%)', icon: Truck },
  { type: 'parceiro', label: 'Parceiros', color: 'hsl(142, 71%, 45%)', icon: Handshake },
  { type: 'colaborador', label: 'Colaboradores', color: 'hsl(190, 70%, 50%)', icon: UserCheck },
  { type: 'prestador_servico', label: 'Prestadores', color: 'hsl(340, 65%, 55%)', icon: Wrench },
];

/** Contact Kanban View component for the contacts section. */
export function ContactKanbanView({ contacts, onContactClick }: ContactKanbanViewProps) {
  const [localContacts, setLocalContacts] = useState<KanbanContact[]>(contacts);

  // Sync when parent contacts change
  useMemo(() => {
    setLocalContacts(contacts);
  }, [contacts]);

  const columns = useMemo(() => {
    const grouped: Record<string, KanbanContact[]> = {};
    KANBAN_COLUMNS.forEach((col) => {
      grouped[col.type] = [];
    });

    localContacts.forEach((c) => {
      const type = c.contact_type || 'cliente';
      if (grouped[type]) grouped[type].push(c);
      else if (grouped['cliente']) grouped['cliente'].push(c);
    });

    return KANBAN_COLUMNS.map((col) => ({
      ...col,
      contacts: grouped[col.type] || [],
    }));
  }, [localContacts]);

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      const { draggableId, destination } = result;
      if (!destination) return;

      const newType = destination.droppableId;
      const contact = localContacts.find((c) => c.id === draggableId);
      if (!contact || contact.contact_type === newType) return;

      // Optimistic update
      setLocalContacts((prev) =>
        prev.map((c) => (c.id === draggableId ? { ...c, contact_type: newType } : c))
      );

      const { error } = await dbFrom('contacts')
        .update({ contact_type: newType })
        .eq('id', draggableId);

      if (error) {
        // Revert
        setLocalContacts((prev) =>
          prev.map((c) => (c.id === draggableId ? { ...c, contact_type: contact.contact_type } : c))
        );
        toast.error('Erro ao mover contato');
      } else {
        const col = KANBAN_COLUMNS.find((c) => c.type === newType);
        toast.success(`Movido para ${col?.label || newType}`);
      }
    },
    [localContacts]
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex min-h-[500px] gap-4 overflow-x-auto pb-4">
        {columns.map((column, colIndex) => {
          const Icon = column.icon;
          return (
            <motion.div
              key={column.type}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: colIndex * 0.08 }}
              className="w-[280px] flex-shrink-0"
            >
              <Card className="h-full border-border/40">
                <CardHeader className="px-4 pb-3 pt-4">
                  <CardTitle className="flex items-center justify-between text-sm font-semibold">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${column.color}20` }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: column.color }} />
                      </div>
                      {column.label}
                    </div>
                    <Badge variant="secondary" className="h-5 text-[10px]">
                      {column.contacts.length}
                    </Badge>
                  </CardTitle>
                  <div
                    className="mt-2 h-0.5 rounded-full"
                    style={{ backgroundColor: column.color, opacity: 0.4 }}
                  />
                </CardHeader>
                <Droppable droppableId={column.type}>
                  {(provided, snapshot) => (
                    <CardContent
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'min-h-[100px] rounded-b-lg px-3 pb-3 transition-colors duration-200',
                        snapshot.isDraggingOver && 'bg-primary/5'
                      )}
                    >
                      <ScrollArea className="max-h-[60vh]">
                        <div className="space-y-2">
                          {column.contacts.map((contact, i) => {
                            const colors = getAvatarColor(contact.name);
                            return (
                              <Draggable key={contact.id} draggableId={contact.id} index={i}>
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...(dragProvided.draggableProps as unknown as HTMLAttributes<HTMLDivElement>)} // ignore-audit — react-beautiful-dnd DraggableProps doesn't extend HTMLAttributes; same shape at runtime
                                    className={cn(
                                      'w-full rounded-lg border border-border/30 p-3 text-left',
                                      'bg-card hover:border-primary/20 hover:bg-muted/40',
                                      'group cursor-pointer transition-all duration-150',
                                      dragSnapshot.isDragging &&
                                        'rotate-1 shadow-lg ring-2 ring-primary/30'
                                    )}
                                    onClick={() =>
                                      !dragSnapshot.isDragging && onContactClick(contact.id)
                                    }
                                    onKeyDown={(e) =>
                                      !dragSnapshot.isDragging &&
                                      e.key === 'Enter' &&
                                      onContactClick(contact.id)
                                    }
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div
                                        {...dragProvided.dragHandleProps}
                                        className="cursor-grab opacity-0 transition-opacity hover:!opacity-100 active:cursor-grabbing group-hover:opacity-50"
                                      >
                                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                      </div>
                                      <Avatar className="h-8 w-8">
                                        <AvatarImage
                                          src={contact.avatar_url || undefined}
                                          alt={contact.name}
                                        />
                                        <AvatarFallback
                                          className={cn(
                                            colors.bg,
                                            colors.text,
                                            'text-[10px] font-bold'
                                          )}
                                        >
                                          {getInitials(contact.name)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-foreground">
                                          {contact.name} {contact.surname || ''}
                                        </p>
                                        {contact.company && (
                                          <p className="truncate text-[10px] text-muted-foreground">
                                            {contact.company}
                                          </p>
                                        )}
                                      </div>
                                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
                                    </div>
                                    {contact.tags && contact.tags.length > 0 && (
                                      <div className="ml-6 mt-2 flex flex-wrap gap-1">
                                        {contact.tags.slice(0, 2).map((tag) => (
                                          <Badge
                                            key={tag}
                                            variant="secondary"
                                            className="h-4 px-1 text-[9px]"
                                          >
                                            {tag}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  )}
                </Droppable>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
