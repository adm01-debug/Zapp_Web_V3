import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CreateQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (queue: {
    name: string;
    description: string;
    color: string;
  }) => void | boolean | Promise<void | boolean>;
  /** Quando presente, o dialog abre em modo de edição pré-preenchido com esses valores. */
  initialQueue?: { name: string; description: string | null; color: string } | null;
}

const COLORS = [
  'bg-primary', // blue
  'bg-success', // green
  'bg-warning', // amber
  'bg-destructive', // red
  'bg-accent', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

/** Create Queue Dialog component for the queues section. Also handles edit mode via `initialQueue`. */
export function CreateQueueDialog({
  open,
  onOpenChange,
  onSubmit,
  initialQueue,
}: CreateQueueDialogProps) {
  const isEditMode = !!initialQueue;
  const [name, setName] = useState(initialQueue?.name ?? '');
  const [description, setDescription] = useState(initialQueue?.description ?? '');
  const [color, setColor] = useState(initialQueue?.color ?? COLORS[0]);
  const [loading, setLoading] = useState(false);

  // Re-sincroniza os campos sempre que o dialog abre para uma fila diferente
  // (ou para o modo de criação, quando initialQueue é null).
  useEffect(() => {
    if (!open) return;
    setName(initialQueue?.name ?? '');
    setDescription(initialQueue?.description ?? '');
    setColor(initialQueue?.color ?? COLORS[0]);
  }, [open, initialQueue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const result = await onSubmit({ name, description, color });
      // Keep the dialog open when the mutation explicitly reported a failure.
      if (result === false) return;
      if (!isEditMode) {
        setName('');
        setDescription('');
        setColor(COLORS[0]);
      }
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/30 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEditMode ? 'Editar Fila' : 'Nova Fila'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-foreground">
              Nome *
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Suporte Técnico"
              className="border-border/30 bg-muted/20"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-foreground">
              Descrição (opcional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o propósito desta fila..."
              className="resize-none border-border/30 bg-muted/20"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Cor</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Selecionar cor ${c}`}
                  aria-pressed={color === c}
                  className={`h-8 w-8 rounded-full transition-all ${
                    color === c
                      ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-card'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {isEditMode
                ? loading
                  ? 'Salvando...'
                  : 'Salvar Alterações'
                : loading
                  ? 'Criando...'
                  : 'Criar Fila'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
