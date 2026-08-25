import { motion, AnimatePresence } from '@/components/ui/motion';
import {
  Plus,
  Trash2,
  ExternalLink,
  Phone,
  MessageSquare,
  GripVertical,
  X,
  Check,
  List,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InteractiveMessage } from '@/types/chat';
import { cn } from '@/lib/utils';
import { useInteractiveMessage } from './interactive-builder/useInteractiveMessage';
import { getButtonTypeIcon, getButtonTypeLabel } from './interactive-builder/ButtonTypeHelpers';
import { MessagePreview } from './interactive-builder/MessagePreview';

interface InteractiveMessageBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (interactive: InteractiveMessage) => void;
}

/** Interactive Message Builder component. */
export function InteractiveMessageBuilder({
  open,
  onOpenChange,
  onSend,
}: InteractiveMessageBuilderProps) {
  const {
    messageType,
    setMessageType,
    body,
    setBody,
    footer,
    setFooter,
    headerText,
    setHeaderText,
    buttons,
    listButtonText,
    setListButtonText,
    sections,
    expandedSections,
    resetForm,
    addButton,
    updateButton,
    removeButton,
    addSection,
    updateSection,
    removeSection,
    addRowToSection,
    updateRow,
    removeRow,
    toggleSection,
    getTotalRows,
    validate,
    buildMessage,
  } = useInteractiveMessage();

  const handleSend = () => {
    if (!validate()) return;
    onSend(buildMessage());
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Mensagem Interativa
          </DialogTitle>
          <DialogDescription>
            Crie mensagens com botões de ação ou listas seguindo o padrão WhatsApp Business
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={messageType}
          onValueChange={(v) =>
            setMessageType(
              v as
                | 'buttons'
                | 'list' /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
            )
          }
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buttons" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Botões
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              Lista
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4">
            {/* Header */}
            <div className="space-y-2">
              <Label htmlFor="msg-header" className="text-xs text-muted-foreground">
                Cabeçalho (opcional)
              </Label>
              <Input
                id="msg-header"
                placeholder="Título da mensagem..."
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                maxLength={60}
              />
              <p className="text-right text-[10px] text-muted-foreground">{headerText.length}/60</p>
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label htmlFor="msg-body">Mensagem *</Label>
              <Textarea
                id="msg-body"
                placeholder="Digite o corpo da mensagem..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1024}
                rows={3}
              />
              <p className="text-right text-[10px] text-muted-foreground">{body.length}/1024</p>
            </div>

            {/* Footer */}
            <div className="space-y-2">
              <Label htmlFor="msg-footer" className="text-xs text-muted-foreground">
                Rodapé (opcional)
              </Label>
              <Input
                id="msg-footer"
                placeholder="Texto do rodapé..."
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                maxLength={60}
              />
              <p className="text-right text-[10px] text-muted-foreground">{footer.length}/60</p>
            </div>

            {/* Buttons Tab */}
            <TabsContent value="buttons" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>Adicionar Botão</Label>
                <div className="flex gap-2">
                  {[
                    { type: 'reply' as const, icon: MessageSquare, label: 'Resposta' },
                    { type: 'url' as const, icon: ExternalLink, label: 'URL' },
                    { type: 'phone' as const, icon: Phone, label: 'Telefone' },
                  ].map(({ type, icon: Icon, label }) => (
                    <Button
                      key={type}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addButton(type)}
                      disabled={buttons.length >= 3}
                      className="flex-1 gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {buttons.length}/3 botões (limite WhatsApp)
                </p>
              </div>

              <AnimatePresence mode="popLayout">
                {buttons.map((button, index) => (
                  <motion.div
                    key={button.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="secondary" className="gap-1">
                          {getButtonTypeIcon(button.type)}
                          {getButtonTypeLabel(button.type)}
                        </Badge>
                      </div>
                      <Button
                        aria-label="Remover botão"
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeButton(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Input
                        aria-label={`Título do botão ${index + 1}`}
                        placeholder="Título do botão (máx. 20 caracteres)"
                        value={button.title}
                        onChange={(e) => updateButton(index, { title: e.target.value })}
                        maxLength={20}
                      />
                      {button.type === 'url' && (
                        <Input
                          aria-label={`URL do botão ${index + 1}`}
                          placeholder="https://exemplo.com"
                          value={button.url || ''}
                          onChange={(e) => updateButton(index, { url: e.target.value })}
                          type="url"
                        />
                      )}
                      {button.type === 'phone' && (
                        <Input
                          aria-label={`Telefone do botão ${index + 1}`}
                          placeholder="+55 11 99999-0000"
                          value={button.phoneNumber || ''}
                          onChange={(e) => updateButton(index, { phoneNumber: e.target.value })}
                          type="tel"
                        />
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {buttons.length === 0 && (
                <div className="py-6 text-center text-muted-foreground">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">Adicione botões clicando acima</p>
                </div>
              )}
            </TabsContent>

            {/* List Tab */}
            <TabsContent value="list" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="list-btn-text">Texto do Botão de Lista *</Label>
                <Input
                  id="list-btn-text"
                  placeholder="Ver opções"
                  value={listButtonText}
                  onChange={(e) => setListButtonText(e.target.value)}
                  maxLength={20}
                />
                <p className="text-[10px] text-muted-foreground">
                  {listButtonText.length}/20 - Este botão abrirá a lista de opções
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Seções</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSection}
                    disabled={sections.length >= 10}
                    className="h-7 gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Seção
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {sections.length}/10 seções · {getTotalRows()} itens total
                </p>
              </div>

              <AnimatePresence mode="popLayout">
                {sections.map((section, sectionIndex) => {
                  const sectionId = `section_${sectionIndex}`;
                  const isExpanded = expandedSections.includes(sectionId);
                  return (
                    <motion.div
                      key={sectionIndex}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden rounded-lg border border-border bg-muted/30"
                    >
                      <Collapsible open={isExpanded} onOpenChange={() => toggleSection(sectionId)}>
                        <CollapsibleTrigger className="flex w-full items-center justify-between p-3 transition-colors hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 text-muted-foreground transition-transform',
                                isExpanded && 'rotate-180'
                              )}
                            />
                            <Badge variant="outline" className="gap-1">
                              <List className="h-3 w-3" />
                              Seção {sectionIndex + 1}
                            </Badge>
                            {section.title && (
                              <span className="max-w-[150px] truncate text-sm text-muted-foreground">
                                {section.title}
                              </span>
                            )}
                            <Badge variant="secondary" className="text-[10px]">
                              {section.rows.length} {section.rows.length === 1 ? 'item' : 'itens'}
                            </Badge>
                          </div>
                          <Button
                            aria-label="Remover seção"
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSection(sectionIndex);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-3 border-t border-border/50 p-3 pt-0">
                            <div className="space-y-1">
                              <Label htmlFor={`section-title-${sectionIndex}`} className="text-xs">
                                Título da Seção *
                              </Label>
                              <Input
                                id={`section-title-${sectionIndex}`}
                                placeholder="Ex: Categorias, Opções, Produtos..."
                                value={section.title}
                                onChange={(e) =>
                                  updateSection(sectionIndex, { title: e.target.value })
                                }
                                maxLength={24}
                              />
                              <p className="text-right text-[10px] text-muted-foreground">
                                {section.title.length}/24
                              </p>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs">Itens</Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addRowToSection(sectionIndex)}
                                  disabled={section.rows.length >= 10}
                                  className="h-6 gap-1 text-xs"
                                >
                                  <Plus className="h-3 w-3" />
                                  Item
                                </Button>
                              </div>
                              <AnimatePresence mode="popLayout">
                                {section.rows.map((row, rowIndex) => (
                                  <motion.div
                                    key={row.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className="space-y-2 rounded-md border border-border/50 bg-background p-2"
                                  >
                                    <div className="flex items-start gap-2">
                                      <div className="flex-1 space-y-2">
                                        <Input
                                          aria-label={`Título do item ${rowIndex + 1} da seção ${sectionIndex + 1}`}
                                          placeholder="Título do item (máx. 24)"
                                          value={row.title}
                                          onChange={(e) =>
                                            updateRow(sectionIndex, rowIndex, {
                                              title: e.target.value,
                                            })
                                          }
                                          maxLength={24}
                                          className="h-8 text-sm"
                                        />
                                        <Input
                                          aria-label={`Descrição do item ${rowIndex + 1} da seção ${sectionIndex + 1}`}
                                          placeholder="Descrição (opcional, máx. 72)"
                                          value={row.description || ''}
                                          onChange={(e) =>
                                            updateRow(sectionIndex, rowIndex, {
                                              description: e.target.value,
                                            })
                                          }
                                          maxLength={72}
                                          className="h-8 text-sm"
                                        />
                                      </div>
                                      <Button
                                        aria-label="Remover item"
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                                        onClick={() => removeRow(sectionIndex, rowIndex)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                              {section.rows.length === 0 && (
                                <div className="py-3 text-center text-xs text-muted-foreground">
                                  Adicione itens a esta seção
                                </div>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {sections.length === 0 && (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-muted-foreground">
                  <List className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">Adicione seções para criar a lista</p>
                  <p className="mt-1 text-xs">Cada seção pode ter até 10 itens</p>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <MessagePreview
          body={body}
          headerText={headerText}
          footer={footer}
          messageType={messageType}
          buttons={buttons}
          listButtonText={listButtonText}
          sections={sections}
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} className="gap-2">
            <Check className="h-4 w-4" />
            Enviar Mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
