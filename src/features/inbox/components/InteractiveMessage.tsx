import { useState } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { ExternalLink, Phone, MessageSquare, ChevronRight, List, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  InteractiveMessage as InteractiveMessageType,
  InteractiveButton,
  InteractiveListSection,
} from '@/types/chat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InteractiveMessageProps {
  interactive: InteractiveMessageType;
  isSent: boolean;
  onButtonClick?: (button: InteractiveButton) => void;
  onListItemClick?: (sectionTitle: string, rowId: string, rowTitle: string) => void;
  disabled?: boolean;
}

/** Interactive Message Display component. */
export function InteractiveMessageDisplay({
  interactive,
  isSent,
  onButtonClick,
  onListItemClick,
  disabled = false,
}: InteractiveMessageProps) {
  const [listOpen, setListOpen] = useState(false);

  const handleButtonClick = (button: InteractiveButton) => {
    if (disabled) return;

    if (button.type === 'url' && button.url) {
      window.open(button.url, '_blank', 'noopener,noreferrer');
    } else if (button.type === 'phone' && button.phoneNumber) {
      window.open(`tel:${button.phoneNumber}`, '_self');
    } else if (button.type === 'reply') {
      onButtonClick?.(button);
    }
  };

  const handleListItemClick = (
    section: InteractiveListSection,
    rowId: string,
    rowTitle: string
  ) => {
    if (disabled) return;
    onListItemClick?.(section.title, rowId, rowTitle);
    setListOpen(false);
  };

  const getButtonIcon = (button: InteractiveButton) => {
    switch (button.type) {
      case 'url':
        return <ExternalLink className="h-3.5 w-3.5" />;
      case 'phone':
        return <Phone className="h-3.5 w-3.5" />;
      case 'reply':
        return <MessageSquare className="h-3.5 w-3.5" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-2">
        {/* Header */}
        {interactive.header && (
          <div className="mb-2">
            {interactive.header.type === 'text' && (
              <p
                className={cn(
                  'text-sm font-semibold',
                  isSent ? 'text-primary-foreground' : 'text-foreground'
                )}
              >
                {interactive.header.text}
              </p>
            )}
            {interactive.header.type === 'image' && interactive.header.mediaUrl && (
              <img
                src={interactive.header.mediaUrl}
                alt="Imagem do cabeçalho da mensagem"
                className="mb-2 h-auto max-w-full rounded-lg"
              />
            )}
          </div>
        )}

        {/* Body */}
        <p
          className={cn(
            'whitespace-pre-wrap text-sm',
            isSent ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          {interactive.body}
        </p>

        {/* Footer */}
        {interactive.footer && (
          <p
            className={cn(
              'mt-1 text-xs',
              isSent ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {interactive.footer}
          </p>
        )}

        {/* Buttons */}
        {interactive.type === 'buttons' && interactive.buttons && (
          <div className="border-current/10 mt-3 flex flex-col gap-1.5 border-t pt-2">
            {interactive.buttons.map((button, index) => (
              <motion.button
                key={button.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: disabled ? 1 : 1.02 }}
                whileTap={{ scale: disabled ? 1 : 0.98 }}
                onClick={() => handleButtonClick(button)}
                disabled={disabled}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  isSent
                    ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
                    : 'bg-primary/10 text-primary hover:bg-primary/20',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                {getButtonIcon(button)}
                <span>{button.title}</span>
                {button.type === 'url' && <ChevronRight className="ml-auto h-3 w-3" />}
              </motion.button>
            ))}
          </div>
        )}

        {/* List Button */}
        {interactive.type === 'list' && interactive.listButtonText && (
          <motion.button
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={() => !disabled && setListOpen(true)}
            disabled={disabled}
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all',
              isSent
                ? 'border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10'
                : 'border-primary/30 text-primary hover:bg-primary/5',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <List className="h-4 w-4" />
            {interactive.listButtonText}
          </motion.button>
        )}
      </div>

      {/* List Dialog */}
      {interactive.type === 'list' && interactive.sections && (
        <Dialog open={listOpen} onOpenChange={setListOpen}>
          <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
            <DialogHeader className="border-b border-border p-4 pb-2">
              <DialogTitle className="flex items-center gap-2 text-base">
                <List className="h-5 w-5 text-primary" />
                {interactive.header?.text || 'Selecione uma opção'}
              </DialogTitle>
              {interactive.body && (
                <p className="mt-1 text-sm text-muted-foreground">{interactive.body}</p>
              )}
            </DialogHeader>

            <ScrollArea className="max-h-[60vh]">
              <div className="p-2">
                {interactive.sections.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="mb-2 last:mb-0">
                    {/* Section Header */}
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.title}
                    </div>

                    {/* Section Items */}
                    <div className="space-y-1">
                      <AnimatePresence>
                        {section.rows.map((row, rowIndex) => (
                          <motion.button
                            key={row.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: rowIndex * 0.03 }}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => handleListItemClick(section, row.id, row.title)}
                            className="group w-full rounded-lg p-3 text-left transition-colors hover:bg-muted/80"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                                  {row.title}
                                </p>
                                {row.description && (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                    {row.description}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                            </div>
                          </motion.button>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {interactive.footer && (
              <div className="border-t border-border bg-muted/30 p-3">
                <p className="text-center text-xs text-muted-foreground">{interactive.footer}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// List Item Response Badge (when user selects a list item)
interface ListResponseBadgeProps {
  sectionTitle: string;
  itemTitle: string;
  isSent: boolean;
}

/** List Response Badge component. */
export function ListResponseBadge({ sectionTitle, itemTitle, isSent }: ListResponseBadgeProps) {
  return (
    <div
      className={cn(
        'mb-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
        isSent ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
      )}
    >
      <Check className="h-3 w-3" />
      <span className="opacity-70">{sectionTitle}:</span>
      <span className="font-medium">{itemTitle}</span>
    </div>
  );
}

// Button Response Badge (when user clicks a button)
interface ButtonResponseBadgeProps {
  buttonTitle: string;
  isSent: boolean;
}

/** Button Response Badge component. */
export function ButtonResponseBadge({ buttonTitle, isSent }: ButtonResponseBadgeProps) {
  return (
    <div
      className={cn(
        'mb-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
        isSent ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
      )}
    >
      <MessageSquare className="h-3 w-3" />
      <span>Resposta: {buttonTitle}</span>
    </div>
  );
}
