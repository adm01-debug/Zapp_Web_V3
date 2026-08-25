import { AnimatePresence, motion } from '@/components/ui/motion';
import {
  Shield,
  Users,
  UserPlus,
  Trash2,
  Search,
  Loader2,
  Crown,
  Eye,
  Headphones,
  Code,
} from 'lucide-react';
import { useUserRole } from '@/features/auth';
import { useRolesPageState } from '@/hooks/admin/useRolesPageState';
import { PermissionMatrix } from '@/features/auth';
import { VisibilityGrantsManager } from '@/features/admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const ROLE_CONFIG = {
  dev: {
    label: 'Desenvolvedor',
    icon: Code,
    color: 'bg-destructive/10 text-destructive dark:bg-destructive/20/30 dark:text-destructive',
    description:
      'Equipe técnica — acesso total inclusive áreas técnicas (telemetria, banco, infra) e informativos do sistema',
  },
  admin: {
    label: 'Administrador',
    icon: Crown,
    color: 'bg-warning/10 text-warning dark:bg-warning/20/30 dark:text-warning',
    description:
      'Gestão completa: pessoas, integrações, configurações. Vê áreas técnicas em modo leitura',
  },
  supervisor: {
    label: 'Supervisor',
    icon: Eye,
    color: 'bg-info/10 text-info dark:bg-info/20/30 dark:text-info',
    description: 'Operação completa do atendimento (inbox, CRM, relatórios, equipe)',
  },
  agent: {
    label: 'Atendente',
    icon: Headphones,
    color: 'bg-success/10 text-success dark:bg-success/20/30 dark:text-success',
    description: 'Atendimento ao cliente — apenas o próprio escopo',
  },
};

/** Roles Page. */
export default function RolesPage() {
  const { isAdmin } = useUserRole();
  const {
    loading,
    search,
    setSearch,
    showAddDialog,
    setShowAddDialog,
    selectedUser,
    setSelectedUser,
    selectedRole,
    setSelectedRole,
    availableUsers,
    userToRemove,
    setUserToRemove,
    updating,
    handleAddRole,
    handleRemoveRole,
    groupedUsers,
  } = useRolesPageState();

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-lg font-semibold">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Roles e Permissões</h1>
          <p className="text-muted-foreground">Gerencie os níveis de acesso do sistema</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Atribuir Role
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <Shield className="mr-2 h-4 w-4" />
            Permissões
          </TabsTrigger>
          <TabsTrigger value="visibility">
            <Eye className="mr-2 h-4 w-4" />
            Visibilidade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar usuários..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(ROLE_CONFIG).map(([role, config]) => {
                const roleUsers = groupedUsers[role as keyof typeof groupedUsers];
                const Icon = config.icon;
                return (
                  <Card key={role}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${config.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{config.label}</CardTitle>
                          <CardDescription className="text-xs">
                            {config.description}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="w-fit">
                        {roleUsers.length} usuário{roleUsers.length !== 1 ? 's' : ''}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {roleUsers.map((user) => (
                          <motion.div
                            key={user.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                                <span className="text-xs font-medium">
                                  {user.profile?.name?.charAt(0).toUpperCase() || '?'}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {user.profile?.name || 'Sem nome'}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {user.profile?.email}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setUserToRemove(user)}
                              className="flex-shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {roleUsers.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          Nenhum usuário com esta role
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <PermissionMatrix />
        </TabsContent>
        <TabsContent value="visibility" className="mt-4">
          <VisibilityGrantsManager />
        </TabsContent>
      </Tabs>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Role</DialogTitle>
            <DialogDescription>Selecione um usuário e a role que deseja atribuir</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Usuário</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select
                value={selectedRole}
                onValueChange={(v) =>
                  setSelectedRole(
                    v as
                      | 'dev'
                      | 'admin'
                      | 'supervisor'
                      | 'agent' /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddRole} disabled={!selectedUser || updating}>
              {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Role?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a role de{' '}
              <strong>{userToRemove?.profile?.name}</strong>? O usuário perderá acesso às
              funcionalidades desta role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveRole}
              disabled={updating}
              className="bg-destructive hover:bg-destructive/90"
            >
              {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
