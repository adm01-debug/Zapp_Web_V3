import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Edit2,
  Trash2,
  Copy,
  Eye,
  Search,
  FileText,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Variable,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import {
  useWhatsAppTemplates,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  STATUS_BADGES,
} from '@/hooks/useWhatsAppTemplates';

const STATUS_ICONS: Record<string, React.ElementType> = {
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
};

/** Whats App Templates Manager component for the catalog section. */
export function WhatsAppTemplatesManager() {
  const {
    templates,
    loading,
    search,
    setSearch,
    filterCategory,
    setFilterCategory,
    filterStatus,
    setFilterStatus,
    isDialogOpen,
    setIsDialogOpen,
    isPreviewOpen,
    setIsPreviewOpen,
    editingTemplate,
    setEditingTemplate,
    previewTemplate,
    previewVariables,
    setPreviewVariables,
    isSaving,
    handleContentChange,
    handleSave,
    handleDelete,
    handleDuplicate,
    handlePreview,
    renderPreviewContent,
    openNew,
    openEdit,
    isSyncing,
    syncFromEvolution,
  } = useWhatsAppTemplates();

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-foreground md:text-xl">Templates WhatsApp</h2>
          <p className="text-xs text-muted-foreground md:text-sm">
            Gerencie templates oficiais aprovados pelo WhatsApp Business API
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            variant="outline"
            onClick={() => void syncFromEvolution()}
            disabled={isSyncing}
            className="w-full gap-2 sm:w-auto"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar Evolution
          </Button>
          <Button
            onClick={openNew}
            className="w-full gap-2 bg-primary hover:bg-primary/90 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Novo Template
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar templates"
            placeholder="Buscar templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {TEMPLATE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="approved">Aprovado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="rejected">Rejeitado</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-secondary/20">
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando templates...</div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum template encontrado</p>
              <Button variant="outline" className="mt-4" onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" />
                Criar primeiro template
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Variáveis</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {templates.map((template) => {
                    const statusInfo = STATUS_BADGES[template.status] || STATUS_BADGES.draft;
                    const StatusIcon = STATUS_ICONS[statusInfo.iconName] || FileText;
                    const categoryInfo = TEMPLATE_CATEGORIES.find(
                      (c) => c.value === template.category
                    );
                    return (
                      <motion.tr
                        key={template.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-b border-border/50"
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{template.name}</p>
                            <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                              {template.content}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs', categoryInfo?.color)}>
                            {categoryInfo?.label || template.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {TEMPLATE_LANGUAGES.find((l) => l.value === template.language)?.label ||
                              template.language}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('gap-1 text-xs', statusInfo.className)}>
                            <StatusIcon className="h-3 w-3" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(template.variables?.length || 0) > 0 ? (
                            <div className="flex gap-1">
                              {template.variables?.map((v: string) => (
                                <Badge key={v} variant="outline" className="text-xs">
                                  {v}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              aria-label="Visualizar template"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handlePreview(template)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              aria-label="Editar template"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(template)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              aria-label="Duplicar template"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDuplicate(template)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              aria-label="Excluir template"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(template.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate.id ? 'Editar Template' : 'Novo Template'}</DialogTitle>
            <DialogDescription>
              Configure o template para uso com a WhatsApp Business API
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tmpl-name">Nome do Template</Label>
                <Input
                  id="tmpl-name"
                  value={editingTemplate.name || ''}
                  onChange={(e) =>
                    setEditingTemplate((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="ex: confirmacao_pedido"
                />
                <p className="text-xs text-muted-foreground">
                  Apenas letras minúsculas e underscores
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tmpl-category">Categoria</Label>
                <Select
                  value={editingTemplate.category || 'utility'}
                  onValueChange={(value) =>
                    setEditingTemplate((prev) => ({ ...prev, category: value }))
                  }
                >
                  <SelectTrigger id="tmpl-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tmpl-language">Idioma</Label>
                <Select
                  value={editingTemplate.language || 'pt_BR'}
                  onValueChange={(value) =>
                    setEditingTemplate((prev) => ({ ...prev, language: value }))
                  }
                >
                  <SelectTrigger id="tmpl-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tmpl-status">Status</Label>
                <Select
                  value={editingTemplate.status || 'draft'}
                  onValueChange={(value) =>
                    setEditingTemplate((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger id="tmpl-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="approved">Aprovado</SelectItem>
                    <SelectItem value="rejected">Rejeitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tmpl-header">Cabeçalho (opcional)</Label>
              <Input
                id="tmpl-header"
                value={editingTemplate.header_text || ''}
                onChange={(e) =>
                  setEditingTemplate((prev) => ({ ...prev, header_text: e.target.value }))
                }
                placeholder="Texto do cabeçalho"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tmpl-content">Conteúdo do Template</Label>
              <Textarea
                id="tmpl-content"
                value={editingTemplate.content || ''}
                onChange={(e) => handleContentChange(e.target.value)}
                rows={6}
                placeholder="Olá {{1}}, seu pedido {{2}} foi confirmado!"
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Variable className="h-3 w-3" />
                Use {'{{1}}'}, {'{{2}}'}, etc. para variáveis dinâmicas
              </div>
              {(editingTemplate.variables?.length || 0) > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {editingTemplate.variables?.map((v) => (
                    <Badge key={v} variant="secondary" className="text-xs">
                      {v}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tmpl-footer">Rodapé (opcional)</Label>
              <Input
                id="tmpl-footer"
                value={editingTemplate.footer_text || ''}
                onChange={(e) =>
                  setEditingTemplate((prev) => ({ ...prev, footer_text: e.target.value }))
                }
                placeholder="Texto do rodapé"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {editingTemplate.id ? 'Atualizar' : 'Criar'} Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preview do Template</DialogTitle>
            <DialogDescription>Visualize como o template será exibido</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              {(previewTemplate.variables?.length || 0) > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Valores das variáveis:</Label>
                  {previewTemplate.variables?.map((v: string) => (
                    <div key={v} className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0">
                        {v}
                      </Badge>
                      <Input
                        value={previewVariables[v] || ''}
                        onChange={(e) =>
                          setPreviewVariables((prev) => ({ ...prev, [v]: e.target.value }))
                        }
                        placeholder={`Valor para ${v}`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-xl bg-[hsl(202_50%_8%)] p-4">
                <div className="ml-auto max-w-[280px] rounded-lg bg-whatsapp-dark p-3">
                  {previewTemplate.header_text && (
                    <p className="mb-1 text-sm font-bold text-primary-foreground">
                      {renderPreviewContent(previewTemplate.header_text, previewVariables)}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-primary-foreground">
                    {renderPreviewContent(previewTemplate.content, previewVariables)}
                  </p>
                  {previewTemplate.footer_text && (
                    <p className="mt-2 text-xs text-primary-foreground/60">
                      {renderPreviewContent(previewTemplate.footer_text, previewVariables)}
                    </p>
                  )}
                  <p className="mt-1 text-right text-[10px] text-primary-foreground/40">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
