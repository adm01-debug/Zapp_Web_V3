import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, MessageSquarePlus, Send, Loader2, UserPlus, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from '@/components/ui/motion';
import { useNewConversation } from '@/features/inbox';

interface NewConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationStarted?: (contactId: string) => void;
}

/** New Conversation Modal component. */
export function NewConversationModal({
  open,
  onOpenChange,
  onConversationStarted,
}: NewConversationModalProps) {
  const {
    searchQuery,
    setSearchQuery,
    contacts,
    selectedContact,
    setSelectedContact,
    newPhone,
    setNewPhone,
    newName,
    setNewName,
    messageText,
    setMessageText,
    isLoading,
    isSending,
    mode,
    setMode,
    connections,
    selectedConnection,
    setSelectedConnection,
    handleSend,
    resetForm,
  } = useNewConversation(open, onConversationStarted, () => onOpenChange(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            Nova Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={mode === 'search' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMode('search');
                setSelectedContact(null);
              }}
              className={cn(mode === 'search' && 'bg-primary')}
            >
              <Search className="mr-1 h-4 w-4" />
              Contato existente
            </Button>
            <Button
              variant={mode === 'new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMode('new');
                setSelectedContact(null);
              }}
              className={cn(mode === 'new' && 'bg-primary')}
            >
              <UserPlus className="mr-1 h-4 w-4" />
              Novo contato
            </Button>
          </div>

          {connections.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="new-conv-connection" className="text-xs text-muted-foreground">
                Conexão WhatsApp
              </Label>
              <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                <SelectTrigger id="new-conv-connection" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'search' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar por nome ou telefone"
                  placeholder="Buscar por nome ou telefone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : contacts.length > 0 ? (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {contacts.map((contact) => (
                    <motion.button
                      key={contact.id}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedContact(contact)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all',
                        selectedContact?.id === contact.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border/30 hover:border-primary/30'
                      )}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={contact.avatar_url || undefined}
                          alt={contact.name || ''}
                        />
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">
                          {contact.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.phone}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : searchQuery.trim() ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  Nenhum contato encontrado
                </p>
              ) : null}
            </div>
          )}

          {mode === 'new' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="new-contact-phone" className="text-xs">
                  Telefone *
                </Label>
                <Input
                  id="new-contact-phone"
                  placeholder="+5511999999999"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="new-contact-name" className="text-xs">
                  Nome (opcional)
                </Label>
                <Input
                  id="new-contact-name"
                  placeholder="Nome do contato"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="new-conv-message" className="text-xs">
              Mensagem
            </Label>
            <Textarea
              id="new-conv-message"
              placeholder="Digite a primeira mensagem..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSend}
              disabled={
                isSending ||
                (!selectedContact && mode === 'search') ||
                (!newPhone.trim() && mode === 'new') ||
                !messageText.trim()
              }
              className="bg-primary hover:bg-primary/90"
            >
              {isSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
