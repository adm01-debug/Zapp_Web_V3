import { useState } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { getLogger } from '@/lib/logger';

const log = getLogger('AISuggestions');
import { Sparkles, Loader2, Check, MessageCircle, HelpCircle, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'agent' | 'contact';
  timestamp: Date;
}

interface Suggestion {
  type: 'direct' | 'empathetic' | 'followup';
  text: string;
  emoji: string;
  source?: string | null;
}

interface AISuggestionsProps {
  messages: Message[];
  contactName: string;
  contactId?: string;
  onSelectSuggestion: (text: string) => void;
}

/** AISuggestions component. */
export function AISuggestions({
  messages,
  contactName,
  contactId,
  onSelectSuggestion,
}: AISuggestionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const { toast } = useToast();

  const fetchSuggestions = async () => {
    if (messages.length === 0) {
      toast({
        title: 'Sem mensagens',
        description: 'É necessário ter mensagens na conversa para gerar sugestões.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setIsOpen(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-suggest-reply', {
        body: {
          messages: messages.slice(-10).map((m) => ({
            content: m.content,
            sender: m.sender,
          })),
          contactName,
          contactId,
        },
      });

      if (error) throw error;

      if (data?.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      log.error('Error fetching suggestions:', error);
      toast({
        title: 'Erro ao gerar sugestões',
        description: error.message || 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (text: string) => {
    onSelectSuggestion(text);
    setIsOpen(false);
    setSuggestions([]);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'direct':
        return <Check className="h-4 w-4" />;
      case 'empathetic':
        return <MessageCircle className="h-4 w-4" />;
      case 'followup':
        return <HelpCircle className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  const getLabel = (type: string) => {
    switch (type) {
      case 'direct':
        return 'Direta';
      case 'empathetic':
        return 'Empática';
      case 'followup':
        return 'Follow-up';
      default:
        return type;
    }
  };

  return (
    <div className="relative">
      <Button
        aria-label="Sugestões de IA"
        variant="ghost"
        size="icon"
        onClick={fetchSuggestions}
        disabled={isLoading}
        className="relative text-primary hover:bg-primary/10 hover:text-primary/80"
        title="Sugestões de IA"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full right-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Copilot IA</span>
                <Badge variant="secondary" className="text-[10px]">
                  KB
                </Badge>
              </div>
              <Button
                aria-label="Fechar sugestões"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-64 overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Gerando sugestões...</span>
                  </div>
                </div>
              ) : suggestions.length > 0 ? (
                <div className="space-y-2">
                  {suggestions.map((suggestion, index) => (
                    <motion.button
                      key={suggestion.text}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleSelect(suggestion.text)}
                      className="group w-full rounded-lg border border-transparent bg-background p-3 text-left transition-all hover:border-primary/30 hover:bg-primary/10"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-primary">{getIcon(suggestion.type)}</span>
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {getLabel(suggestion.type)}
                        </span>
                        <span className="ml-auto text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          Usar ↵
                        </span>
                      </div>
                      <p className="line-clamp-3 text-sm text-foreground">
                        {suggestion.emoji} {suggestion.text}
                      </p>
                      {suggestion.source && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          📚 Fonte: {suggestion.source}
                        </p>
                      )}
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Clique para gerar sugestões
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
