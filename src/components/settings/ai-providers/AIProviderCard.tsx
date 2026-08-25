import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Trash2, TestTube, Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from '@/components/ui/motion';
import type { AIProvider } from './types';
import { PROVIDER_LABELS, USE_FOR_OPTIONS } from './types';

interface AIProviderCardProps {
  provider: AIProvider;
  testing: string | null;
  onTest: (p: AIProvider) => void;
  onEdit: (p: AIProvider) => void;
  onDelete: (id: string) => void;
  index: number;
}

/** AIProvider Card component for the settings section. */
export function AIProviderCard({
  provider: p,
  testing,
  onTest,
  onEdit,
  onDelete,
  index,
}: AIProviderCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const meta = PROVIDER_LABELS[p.provider_type] || PROVIDER_LABELS.custom_agent;
  const Icon = meta.icon;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3 }}
      >
        <Card
          className={cn(
            'border-border/60 transition-all duration-200 hover:shadow-md',
            !p.is_active && 'opacity-50 grayscale-[30%]'
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className={cn('shrink-0 rounded-xl p-2.5 transition-colors', meta.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{p.name}</h3>
                    {p.is_default && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Star className="h-3 w-3" /> Padrão
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn('text-xs', meta.color)}>
                      {meta.label}
                    </Badge>
                    {!p.is_active && (
                      <Badge variant="destructive" className="text-xs">
                        Inativo
                      </Badge>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {p.use_for.map((u) => (
                      <Badge key={u} variant="outline" className="px-1.5 text-[10px]">
                        {USE_FOR_OPTIONS.find((o) => o.value === u)?.label || u}
                      </Badge>
                    ))}
                    {p.model && (
                      <span className="ml-2 text-xs text-muted-foreground">{p.model}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onTest(p)}
                      disabled={testing === p.id || !p.is_active}
                      className="rounded-xl"
                      aria-label="Testar conexão"
                    >
                      {testing === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Testar conexão</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(p)}
                      className="rounded-xl"
                      aria-label="Editar provedor"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Editar</TooltipContent>
                </Tooltip>
                {p.provider_type !== 'lovable_ai' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteOpen(true)}
                        className="rounded-xl"
                        aria-label="Remover provedor"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remover</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{p.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação é irreversível. As funcionalidades que usam este provedor serão
              automaticamente redirecionadas para o provedor padrão (Lovable AI).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(p.id)}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover Provedor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
