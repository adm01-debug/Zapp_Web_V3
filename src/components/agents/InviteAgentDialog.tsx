import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Mail, UserPlus } from 'lucide-react';
import { invokeEdge } from '@/lib/invokeEdge';
import { toast } from 'sonner';

interface InviteAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Invite Agent Dialog component for the agents section. */
export function InviteAgentDialog({ open, onOpenChange }: InviteAgentDialogProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('agent');
  const [isSending, setIsSending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error('Email é obrigatório');
      return;
    }

    setIsSending(true);
    setFieldErrors({});
    // Bloco 7 (etapa 80, F1): antes `throw error` caía num catch genérico
    // ("Verifique a configuração de email") — hardcoded, mesmo quando o 422
    // apontava um motivo específico (ex.: "to" inválido). invokeEdge nunca
    // lança; preserva a mensagem real e os fieldErrors do contrato.
    const result = await invokeEdge('send-email', {
      body: {
        to: email,
        subject: 'Convite para a plataforma ZAPP',
        html: `
            <h2>Você foi convidado!</h2>
            <p>Olá ${name || 'colega'},</p>
            <p>Você foi convidado para participar da plataforma ZAPP como <strong>${
              role === 'admin'
                ? 'Administrador'
                : role === 'supervisor'
                  ? 'Supervisor'
                  : 'Atendente'
            }</strong>.</p>
            <p>Acesse a plataforma e crie sua conta para começar.</p>
          `,
      },
    });

    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      toast.error(result.message || 'Erro ao enviar convite. Verifique a configuração de email.');
      setIsSending(false);
      return;
    }

    toast.success(`Convite enviado para ${email}!`);
    setEmail('');
    setName('');
    setRole('agent');
    setIsSending(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Convidar Agente
          </DialogTitle>
          <DialogDescription>
            Envie um convite por email para um novo membro da equipe
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="invite-name">Nome</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do agente"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-email">Email *</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agente@empresa.com"
            />
            {fieldErrors.to && (
              <p role="alert" className="text-xs text-destructive">
                {fieldErrors.to}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Cargo</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Atendente</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleInvite} disabled={isSending}>
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Enviar Convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
