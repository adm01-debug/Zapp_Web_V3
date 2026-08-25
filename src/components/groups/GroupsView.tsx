import { useState } from 'react';
import { motion } from '@/components/ui/motion';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Plus,
  Users,
  MessageSquare,
  MoreVertical,
  Trash2,
  RefreshCw,
  Shield,
  Link as LinkIcon,
  Loader2,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { useGroupsManager, GROUP_CATEGORIES } from '@/hooks/useGroupsManager';

/** Groups View component for the groups section. */
export function GroupsView() {
  const {
    groups,
    connections,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    isLoading,
    isSyncing,
    selectedGroups,
    filteredGroups,
    handleAutoSync,
    handleAddGroup,
    handleDeleteGroup,
    handleBroadcast,
    toggleGroupSelection,
    selectAllGroups,
    handleCategoryChange,
    getConnectionName,
  } = useGroupsManager();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: '',
    group_id: '',
    description: '',
    whatsapp_connection_id: '',
    category: '',
  });

  const onAddGroup = async () => {
    const success = await handleAddGroup(newGroup);
    if (success) {
      setNewGroup({
        name: '',
        group_id: '',
        description: '',
        whatsapp_connection_id: '',
        category: '',
      });
      setIsAddDialogOpen(false);
    }
  };

  const onBroadcast = async () => {
    setIsSending(true);
    await handleBroadcast(broadcastMessage);
    setIsSending(false);
    setIsBroadcastOpen(false);
    setBroadcastMessage('');
  };

  return (
    <div className="relative h-full space-y-4 overflow-y-auto bg-background p-3 sm:space-y-6 sm:p-6">
      <AuroraBorealis />
      <FloatingParticles />
      <PageHeader
        title="Grupos WhatsApp"
        subtitle={`Gerencie seus grupos (${groups.length} grupos)`}
        breadcrumbs={[{ label: 'Gestão' }, { label: 'Grupos' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {selectedGroups.size > 0 && (
              <Button variant="default" onClick={() => setIsBroadcastOpen(true)} className="gap-2">
                <Send className="h-4 w-4" />
                Enviar para {selectedGroups.size} grupo(s)
              </Button>
            )}
            <Button variant="outline" onClick={handleAutoSync} disabled={isSyncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-whatsapp text-primary-foreground hover:bg-whatsapp-dark">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Grupo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Grupo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="group_name">Nome do Grupo *</Label>
                    <Input
                      id="group_name"
                      placeholder="Nome do grupo"
                      value={newGroup.name}
                      onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="group_id">ID do Grupo *</Label>
                    <Input
                      id="group_id"
                      placeholder="Ex: 5511999999999-1234567890@g.us"
                      value={newGroup.group_id}
                      onChange={(e) => setNewGroup({ ...newGroup, group_id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Input
                      id="description"
                      placeholder="Descrição do grupo"
                      value={newGroup.description}
                      onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="connection">Conexão WhatsApp</Label>
                    <Select
                      value={newGroup.whatsapp_connection_id}
                      onValueChange={(value) =>
                        setNewGroup({ ...newGroup, whatsapp_connection_id: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma conexão" />
                      </SelectTrigger>
                      <SelectContent>
                        {connections.map((conn) => (
                          <SelectItem key={conn.id} value={conn.id}>
                            {conn.name} ({conn.phone_number})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      value={newGroup.category}
                      onValueChange={(value) => setNewGroup({ ...newGroup, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUP_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            <span className="flex items-center gap-2">
                              <span>{cat.icon}</span>
                              {cat.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={onAddGroup} className="bg-whatsapp hover:bg-whatsapp-dark">
                      Adicionar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Search + Filter + Select All */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou ID do grupo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter || 'all'}
          onValueChange={(v) => setCategoryFilter(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {GROUP_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                <span className="flex items-center gap-2">
                  <span>{cat.icon}</span>
                  {cat.label}
                </span>
              </SelectItem>
            ))}
            <SelectItem value="sem_categoria">Sem categoria</SelectItem>
          </SelectContent>
        </Select>
        {filteredGroups.length > 0 && (
          <Button variant="outline" size="sm" onClick={selectAllGroups}>
            {selectedGroups.size === filteredGroups.length
              ? 'Desselecionar todos'
              : 'Selecionar todos'}
          </Button>
        )}
      </motion.div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="animate-pulse border border-border/20 bg-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-full bg-muted/40" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 rounded bg-muted/40" />
                        <div className="h-3 w-1/3 rounded bg-muted/30" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-3 w-full rounded bg-muted/30" />
                    <div className="h-3 w-2/3 rounded bg-muted/30" />
                    <div className="flex gap-2">
                      <div className="h-5 w-20 rounded-full bg-muted/30" />
                      <div className="h-5 w-16 rounded-full bg-muted/30" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </>
        ) : filteredGroups.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={Users}
              title={search ? 'Nenhum grupo encontrado' : 'Nenhum grupo cadastrado'}
              description={
                search
                  ? 'Tente ajustar o termo de busca'
                  : 'Clique em "Sincronizar" para importar grupos automaticamente ou adicione manualmente'
              }
              illustration="contacts"
              actionLabel={!search ? 'Sincronizar Grupos' : undefined}
              onAction={!search ? handleAutoSync : undefined}
              secondaryActionLabel={search ? 'Limpar busca' : undefined}
              onSecondaryAction={search ? () => setSearch('') : undefined}
            />
          </div>
        ) : (
          filteredGroups.map((group, index) => {
            const isSelected = selectedGroups.has(group.id);
            return (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className={`cursor-pointer border transition-all ${isSelected ? 'border-primary bg-primary/5 shadow-[0_0_20px_hsl(var(--primary)/0.2)]' : 'border-secondary/20 bg-card hover:border-secondary/40 hover:shadow-[0_0_20px_hsl(var(--secondary)/0.2)]'}`}
                  onClick={() => toggleGroupSelection(group.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={group.avatar_url || undefined} alt={group.name} />
                          <AvatarFallback className="bg-whatsapp/10 text-whatsapp">
                            <Users className="h-6 w-6" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="line-clamp-1 text-base">{group.name}</CardTitle>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {group.participant_count} participantes
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label="Opções do grupo"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroupSelection(group.id);
                              setIsBroadcastOpen(true);
                            }}
                          >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Enviar mensagem
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(group.group_id);
                              toast.success('ID copiado!');
                            }}
                          >
                            <LinkIcon className="mr-2 h-4 w-4" />
                            Copiar ID
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGroup(group.id);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {group.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {group.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <LinkIcon className="mr-1 h-3 w-3" />
                        {getConnectionName(group.whatsapp_connection_id)}
                      </Badge>
                      {group.is_admin && (
                        <Badge className="border-whatsapp/20 bg-whatsapp/10 text-xs text-whatsapp">
                          <Shield className="mr-1 h-3 w-3" />
                          Admin
                        </Badge>
                      )}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={group.category || 'none'}
                        onValueChange={(v) =>
                          handleCategoryChange(group.id, v === 'none' ? null : v)
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Sem categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem categoria</SelectItem>
                          {GROUP_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              <span className="flex items-center gap-1.5">
                                <span>{cat.icon}</span>
                                {cat.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="truncate text-xs text-muted-foreground" title={group.group_id}>
                      ID: {group.group_id}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Broadcast Dialog */}
      <Dialog open={isBroadcastOpen} onOpenChange={setIsBroadcastOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Enviar Mensagem em Massa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <strong>{selectedGroups.size}</strong> grupo(s) selecionado(s)
              <div className="mt-1 text-xs text-muted-foreground">
                {groups
                  .filter((g) => selectedGroups.has(g.id))
                  .map((g) => g.name)
                  .slice(0, 5)
                  .join(', ')}
                {selectedGroups.size > 5 && ` e mais ${selectedGroups.size - 5}...`}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                placeholder="Digite a mensagem para enviar a todos os grupos selecionados..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                rows={5}
              />
            </div>
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
              ⚠️ Intervalo de 2 segundos entre envios para evitar bloqueios.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsBroadcastOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={onBroadcast}
                disabled={isSending || !broadcastMessage.trim()}
                className="gap-2 bg-whatsapp hover:bg-whatsapp-dark"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isSending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
