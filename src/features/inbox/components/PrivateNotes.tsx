import { useState } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyNote, Plus, Trash2, Send, Loader2, AlertCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useContactNotes } from '@/hooks/useContactNotes';

interface PrivateNotesProps {
  contactId: string;
}

/** Private Notes component. */
export function PrivateNotes({ contactId }: PrivateNotesProps) {
  const {
    notes,
    isLoading,
    error: loadError,
    refetch,
    addNote,
    deleteNote,
    isAdding: isSaving,
    isDeleting,
    currentProfileId,
  } = useContactNotes(contactId);
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleAddNote = async () => {
    const content = newNote.trim();
    if (!content) return;
    setAddError(null);
    try {
      await addNote(content);
      setNewNote('');
      setIsAddingNote(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Não foi possível salvar a nota.');
    }
  };

  const handleDeleteNote = async (id: string) => {
    setDeleteError(null);
    setDeletingId(id);
    try {
      await deleteNote(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível remover a nota.');
    } finally {
      setDeletingId((curr) => (curr === id ? null : curr));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <StickyNote className="h-4 w-4" />
          <span>Notas Privadas</span>
          <Loader2 className="ml-1 h-3 w-3 animate-spin" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <StickyNote className="h-4 w-4" />
          <span>Notas Privadas</span>
        </div>
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Erro ao carregar notas</p>
            <p className="mt-0.5 text-destructive/80">
              {loadError instanceof Error ? loadError.message : 'Tente novamente.'}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <StickyNote className="h-4 w-4" />
          <span>Notas Privadas</span>
        </div>
        {!isAddingNote && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsAddingNote(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Nova nota
            </Button>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isAddingNote && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <Textarea
              placeholder="Adicione uma nota privada (visível apenas para atendentes)..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              className="resize-none text-sm"
              autoFocus
              disabled={isSaving}
              aria-invalid={!!addError}
              aria-describedby={addError ? 'private-notes-add-error' : undefined}
            />
            {addError && (
              <div
                id="private-notes-add-error"
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="flex-1">{addError}</span>
                <button
                  type="button"
                  onClick={() => setAddError(null)}
                  className="hover:opacity-70"
                  aria-label="Fechar mensagem de erro"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAddingNote(false);
                  setNewNote('');
                  setAddError(null);
                }}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!newNote.trim() || isSaving}
                className="bg-whatsapp hover:bg-whatsapp-dark"
                aria-busy={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Send className="mr-1 h-3 w-3" aria-hidden="true" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {deleteError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="hover:opacity-70"
            aria-label="Fechar mensagem de erro"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="scrollbar-thin max-h-48 space-y-2 overflow-y-auto" aria-live="polite">
        <AnimatePresence>
          {notes.map((note, index) => {
            const isRowDeleting = isDeleting && deletingId === note.id;
            return (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: isRowDeleting ? 0.6 : 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
                className="group rounded-lg border border-border/50 bg-muted/50 p-3 transition-colors hover:border-border"
                aria-busy={isRowDeleting}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-sm text-foreground">{note.content}</p>
                  {note.author_id === currentProfileId && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={isDeleting}
                      aria-label={isRowDeleting ? 'Removendo nota...' : 'Remover nota'}
                      className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 group-hover:opacity-100"
                    >
                      {isRowDeleting ? (
                        <Loader2
                          className="h-3 w-3 animate-spin text-destructive"
                          aria-hidden="true"
                        />
                      ) : (
                        <Trash2 className="h-3 w-3 text-destructive" aria-hidden="true" />
                      )}
                    </motion.button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar className="h-4 w-4">
                    <AvatarImage
                      src={note.author?.avatar_url || undefined}
                      alt={note.author?.name || ''}
                    />
                    <AvatarFallback className="text-[8px]">
                      {note.author?.name?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[10px] text-muted-foreground">
                    {note.author?.name || 'Desconhecido'} •{' '}
                    {format(new Date(note.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {notes.length === 0 && !isAddingNote && (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma nota adicionada</p>
        )}
      </div>
    </div>
  );
}
