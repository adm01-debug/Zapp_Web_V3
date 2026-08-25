import { motion } from '@/components/ui/motion';
import { Button } from '@/components/ui/button';
import { UserPlus, Search, Upload, Users, Filter, Sparkles } from 'lucide-react';

interface ContactEmptyStateProps {
  type: 'no-contacts' | 'no-results' | 'filtered-empty';
  searchQuery?: string;
  activeFilters?: number;
  onAddContact?: () => void;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  onImport?: () => void;
}

/** Contact Empty State component for the contacts section. */
export function ContactEmptyState({
  type,
  searchQuery,
  activeFilters = 0,
  onAddContact,
  onClearSearch,
  onClearFilters,
  onImport,
}: ContactEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center px-8 py-16"
    >
      {/* Animated illustration */}
      <div className="relative mb-6 h-32 w-32">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="flex h-32 w-32 items-center justify-center rounded-3xl bg-primary/10"
        >
          {type === 'no-contacts' && <Users className="h-14 w-14 text-primary/50" />}
          {type === 'no-results' && <Search className="h-14 w-14 text-primary/50" />}
          {type === 'filtered-empty' && <Filter className="h-14 w-14 text-primary/50" />}
        </motion.div>

        {/* Floating decorative dots */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-accent/30"
        />
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2.5, repeat: Infinity, delay: 1 }}
          className="absolute -bottom-1 -left-3 h-4 w-4 rounded-full bg-primary/20"
        />
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          className="absolute -right-6 top-1/2 h-3 w-3"
        >
          <Sparkles className="h-3 w-3 text-primary/30" />
        </motion.div>
      </div>

      {/* Text content */}
      {type === 'no-contacts' && (
        <>
          <h3 className="mb-2 text-lg font-bold text-foreground">Comece sua base de contatos</h3>
          <p className="mb-6 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            Adicione seu primeiro contato manualmente ou importe uma planilha CSV com seus clientes
            e leads
          </p>
          <div className="flex items-center gap-3">
            {onAddContact && (
              <Button onClick={onAddContact} className="gap-2 shadow-lg shadow-primary/20">
                <UserPlus className="h-4 w-4" />
                Novo Contato
              </Button>
            )}
            {onImport && (
              <Button variant="outline" onClick={onImport} className="gap-2">
                <Upload className="h-4 w-4" />
                Importar CSV
              </Button>
            )}
          </div>

          {/* Quick tips */}
          <div className="mt-8 grid max-w-md grid-cols-3 gap-4">
            {[
              { icon: '📱', title: 'WhatsApp', desc: 'Integre conversas' },
              { icon: '🏷️', title: 'Tags', desc: 'Organize por categorias' },
              { icon: '📊', title: 'Analytics', desc: 'Acompanhe métricas' },
            ].map((tip) => (
              <motion.div
                key={tip.title}
                whileHover={{ y: -2 }}
                className="rounded-xl border border-border/20 bg-muted/30 p-3 text-center"
              >
                <span className="text-2xl">{tip.icon}</span>
                <p className="mt-1 text-xs font-medium text-foreground">{tip.title}</p>
                <p className="text-[10px] text-muted-foreground">{tip.desc}</p>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {type === 'no-results' && (
        <>
          <h3 className="mb-2 text-xl font-bold text-foreground">
            Nenhum resultado para "{searchQuery}"
          </h3>
          <p className="mb-6 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            Verifique a ortografia ou tente termos mais genéricos. Você também pode buscar por
            partes do telefone ou empresa.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {onClearSearch && (
              <Button onClick={onClearSearch} className="gap-2 px-6">
                <Search className="h-4 w-4" />
                Limpar Busca
              </Button>
            )}
            {onAddContact && (
              <Button variant="outline" onClick={onAddContact} className="gap-2 px-6">
                <UserPlus className="h-4 w-4" />
                Criar "{searchQuery}"
              </Button>
            )}
          </div>
          <div className="mt-8 w-full max-w-xs border-t border-border/20 pt-6 text-center">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Sugestões Rápidas
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full bg-muted/50 text-[10px]"
                onClick={onClearSearch}
              >
                Remover filtros
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full bg-muted/50 text-[10px]"
                onClick={onAddContact}
              >
                Novo registro
              </Button>
            </div>
          </div>
        </>
      )}

      {type === 'filtered-empty' && (
        <>
          <h3 className="mb-2 text-lg font-bold text-foreground">Sem contatos neste filtro</h3>
          <p className="mb-5 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            Os {activeFilters} filtro{activeFilters > 1 ? 's' : ''} aplicado
            {activeFilters > 1 ? 's' : ''} não retornaram resultados. Tente ajustar os critérios.
          </p>
          {onClearFilters && (
            <Button variant="outline" onClick={onClearFilters} className="gap-2">
              <Filter className="h-4 w-4" />
              Limpar Filtros
            </Button>
          )}
        </>
      )}
    </motion.div>
  );
}
