import { forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Paperclip,
  Image as ImageIcon,
  FileVideo,
  FileAudio,
  FileText,
  X,
  Upload,
  AlertCircle,
  Check,
  Send,
} from 'lucide-react';
import { getFileInputAccept, formatFileSize, WHATSAPP_FILE_TYPES } from '@/utils/whatsappFileTypes';
import { useFileUploadLogic, type QueuedFile } from './useFileUploadLogic';

interface FileMessageData {
  mediaUrl?: string;
  messageType?: string;
  [key: string]: unknown;
}

interface FileUploaderProps {
  instanceName?: string;
  recipientNumber?: string;
  contactId?: string;
  connectionId?: string;
  onFileSelect?: (file: File, category: string) => void;
  onFileSent?: (messageData: FileMessageData) => void;
  disabled?: boolean;
  showDialog?: boolean;
}

/** File Uploader Ref component. */
export interface FileUploaderRef {
  handleExternalFile: (file: File) => void;
  handleExternalFiles: (files: File[]) => void;
  triggerFilePicker: () => void;
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'image':
      return <ImageIcon className="h-5 w-5" />;
    case 'video':
      return <FileVideo className="h-5 w-5" />;
    case 'audio':
      return <FileAudio className="h-5 w-5" />;
    default:
      return <FileText className="h-5 w-5" />;
  }
}

function QueueFileItem({
  queuedFile,
  onRemove,
  disabled,
}: {
  queuedFile: QueuedFile;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={cn(
        'relative rounded-lg border bg-muted/30 p-3',
        queuedFile.status === 'done' && 'border-success/50 bg-success/10',
        queuedFile.status === 'error' && 'border-destructive/50 bg-destructive/10',
        !queuedFile.validation.valid && 'border-destructive/50 bg-destructive/10'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {queuedFile.preview ? (
            <img
              loading="lazy"
              decoding="async"
              src={queuedFile.preview}
              alt="Pré-visualização do arquivo"
              className="h-12 w-12 rounded object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-primary/10 text-primary">
              {getCategoryIcon(queuedFile.validation.category || 'document')}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{queuedFile.file.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {formatFileSize(queuedFile.file.size)}
            </span>
            {queuedFile.validation.valid ? (
              <Badge
                variant="outline"
                className="text-success-accessible h-5 border-success/20 bg-success/10 py-0 text-[10px]"
              >
                {queuedFile.validation.category}
              </Badge>
            ) : (
              <Badge variant="destructive" className="h-5 py-0 text-[10px]">
                Inválido
              </Badge>
            )}
            {queuedFile.status === 'uploading' && (
              <Badge variant="secondary" className="h-5 py-0 text-[10px]">
                Enviando...
              </Badge>
            )}
            {queuedFile.status === 'done' && (
              <Badge
                variant="outline"
                className="text-success-accessible h-5 border-success/20 bg-success/10 py-0 text-[10px]"
              >
                <Check className="mr-1 h-3 w-3" />
                Enviado
              </Badge>
            )}
            {queuedFile.status === 'error' && (
              <Badge variant="destructive" className="h-5 py-0 text-[10px]">
                <AlertCircle className="mr-1 h-3 w-3" />
                Erro
              </Badge>
            )}
          </div>
          {(queuedFile.status === 'uploading' || queuedFile.status === 'sending') && (
            <Progress value={queuedFile.progress} className="mt-2 h-1" />
          )}
        </div>
        <Button
          aria-label="Remover arquivo"
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={onRemove}
          disabled={disabled}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </motion.div>
  );
}

/** File Uploader component. */
export const FileUploader = forwardRef<FileUploaderRef, FileUploaderProps>(
  (
    {
      instanceName,
      recipientNumber,
      contactId,
      connectionId,
      onFileSelect,
      onFileSent,
      disabled,
      showDialog = true,
    },
    ref
  ) => {
    const logic = useFileUploadLogic({
      instanceName,
      recipientNumber,
      contactId,
      connectionId,
      onFileSelect,
      onFileSent,
      showDialog,
    });

    useImperativeHandle(ref, () => ({
      handleExternalFile: logic.handleExternalFile,
      handleExternalFiles: logic.handleExternalFiles,
      triggerFilePicker: () => logic.fileInputRef.current?.click(),
    }));

    return (
      <>
        <input
          ref={logic.fileInputRef}
          type="file"
          accept={getFileInputAccept()}
          onChange={logic.handleFileChange}
          className="hidden"
          disabled={disabled || logic.uploading}
          multiple
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
                onClick={() => logic.fileInputRef.current?.click()}
                disabled={disabled || logic.uploading}
                aria-label="Anexar arquivo"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="top">Anexar arquivo</TooltipContent>
        </Tooltip>

        <Dialog open={logic.isDialogOpen} onOpenChange={logic.handleClose}>
          <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {logic.isMultiMode ? `Enviar ${logic.fileQueue.length} Arquivos` : 'Enviar Arquivo'}
              </DialogTitle>
              <DialogDescription>
                {logic.isMultiMode
                  ? `${logic.validFilesCount} de ${logic.fileQueue.length} arquivos válidos`
                  : 'Formatos suportados: imagens, vídeos, áudios e documentos'}
              </DialogDescription>
            </DialogHeader>

            {logic.isMultiMode && logic.fileQueue.length > 0 && (
              <div className="max-h-[40vh] flex-1 space-y-3 overflow-y-auto py-2">
                {logic.fileQueue.map((qf) => (
                  <QueueFileItem
                    key={qf.id}
                    queuedFile={qf}
                    onRemove={() => logic.removeFromQueue(qf.id)}
                    disabled={logic.uploading}
                  />
                ))}
              </div>
            )}

            {!logic.isMultiMode && logic.filePreview && (
              <div className="space-y-4">
                {logic.filePreview.preview && logic.filePreview.file.type === 'application/pdf' && (
                  <div className="overflow-hidden rounded-lg border bg-muted/30">
                    <iframe
                      src={`${logic.filePreview.preview}#toolbar=0&navpanes=0`}
                      className="h-[280px] w-full border-0"
                      title="PDF Preview"
                    />
                  </div>
                )}
                <div className="relative rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      {logic.filePreview.preview &&
                      logic.filePreview.file.type !== 'application/pdf' ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={logic.filePreview.preview}
                          alt="Pré-visualização do arquivo"
                          className="h-20 w-20 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {getCategoryIcon(logic.filePreview.validation.category || 'document')}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{logic.filePreview.file.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatFileSize(logic.filePreview.file.size)}
                      </p>
                      {logic.filePreview.validation.valid ? (
                        <Badge
                          variant="outline"
                          className="text-success-accessible mt-2 border-success/20 bg-success/10 text-xs"
                        >
                          <Check className="mr-1 h-3 w-3" />
                          {logic.filePreview.validation.category}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="mt-2 text-xs">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Inválido
                        </Badge>
                      )}
                    </div>
                    <Button
                      aria-label="Fechar upload"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={logic.handleClose}
                      disabled={logic.uploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {!logic.filePreview.validation.valid && (
                    <div className="mt-3 rounded-lg bg-destructive/10 p-3">
                      <p className="flex items-start gap-2 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        {logic.filePreview.validation.error}
                      </p>
                    </div>
                  )}
                </div>
                {logic.filePreview.validation.valid &&
                  ['image', 'video', 'document'].includes(
                    logic.filePreview.validation.category || ''
                  ) && (
                    <div className="space-y-2">
                      <Label htmlFor="caption">Legenda (opcional)</Label>
                      <Input
                        id="caption"
                        placeholder="Adicione uma legenda..."
                        value={logic.caption}
                        onChange={(e) => logic.setCaption(e.target.value)}
                        disabled={logic.uploading}
                      />
                    </div>
                  )}
                <AnimatePresence>
                  {logic.uploading && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <Progress value={logic.uploadProgress} className="h-2" />
                      <p className="text-center text-xs text-muted-foreground">
                        {logic.uploadStage === 'uploading'
                          ? `Fazendo upload... ${logic.uploadProgress}%`
                          : `Enviando via WhatsApp... ${logic.uploadProgress}%`}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="mb-2 font-medium">Limites de tamanho do WhatsApp:</p>
              <ul className="space-y-1">
                <li>• Imagens: até {WHATSAPP_FILE_TYPES.image.maxSizeMB}MB (JPG, PNG, WebP)</li>
                <li>• Vídeos: até {WHATSAPP_FILE_TYPES.video.maxSizeMB}MB (MP4, 3GP)</li>
                <li>• Áudios: até {WHATSAPP_FILE_TYPES.audio.maxSizeMB}MB (AAC, MP3, OGG, OPUS)</li>
                <li>
                  • Documentos: até {WHATSAPP_FILE_TYPES.document.maxSizeMB}MB (PDF, DOC, XLS, etc)
                </li>
              </ul>
            </div>

            {!logic.canSend && (
              <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
                <p className="flex items-center gap-2 text-sm text-warning">
                  <AlertCircle className="h-4 w-4" />
                  Selecione uma conversa para enviar o arquivo via WhatsApp
                </p>
              </div>
            )}

            {logic.isMultiMode && logic.uploading && (
              <div className="space-y-2">
                <Progress value={logic.totalQueueProgress} className="h-2" />
                <p className="text-center text-xs text-muted-foreground">
                  Enviando arquivo {logic.currentQueueIndex + 1} de {logic.fileQueue.length}...
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={logic.handleClose} disabled={logic.uploading}>
                Cancelar
              </Button>
              <Button
                onClick={logic.isMultiMode ? logic.handleSendAllFiles : logic.handleSendFile}
                disabled={
                  (logic.isMultiMode
                    ? logic.validFilesCount === 0
                    : !logic.filePreview?.validation.valid) ||
                  logic.uploading ||
                  logic.apiLoading
                }
                className="bg-whatsapp hover:bg-whatsapp-dark"
              >
                {logic.uploading ? (
                  'Enviando...'
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {logic.isMultiMode
                      ? `Enviar ${logic.validFilesCount} arquivo${logic.validFilesCount !== 1 ? 's' : ''}`
                      : logic.canSend
                        ? 'Enviar'
                        : 'Selecionar'}
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

FileUploader.displayName = 'FileUploader';
