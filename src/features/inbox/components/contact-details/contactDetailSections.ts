import { LucideIcon } from 'lucide-react';
import {
  Info,
  Smartphone,
  Brain,
  Sparkles,
  Tag,
  User,
  ListTodo,
  Bell,
  FileText,
  Clock,
  BarChart3,
  Image,
  TrendingUp,
  ShoppingBag,
  GitBranch,
} from 'lucide-react';

/** Accordion Section Config interface definition. */
export interface AccordionSectionConfig {
  value: string;
  label: string;
  icon: LucideIcon;
  customIndex: number;
}

/** Configuration for all accordion sections in ContactDetails */
export const CONTACT_DETAIL_SECTIONS: AccordionSectionConfig[] = [
  { value: 'info', label: 'Informações', icon: Info, customIndex: 0 },
  { value: 'whatsapp-status', label: 'Status WhatsApp', icon: Smartphone, customIndex: 1 },
  { value: 'sla-ai', label: 'SLA & Inteligência', icon: Brain, customIndex: 1 },
  { value: 'sla-config', label: 'Configurações de SLA', icon: Clock, customIndex: 1.2 },
  { value: 'crm-360', label: 'CRM 360°', icon: Sparkles, customIndex: 2 },
  { value: 'intelligence', label: 'Inteligência Comercial', icon: Brain, customIndex: 2.5 },
  { value: 'tags', label: 'Tags', icon: Tag, customIndex: 3 },
  { value: 'assignment', label: 'Atribuição', icon: User, customIndex: 4 },
  { value: 'tasks', label: 'Tarefas', icon: ListTodo, customIndex: 5.5 },
  { value: 'reminders', label: 'Lembretes', icon: Bell, customIndex: 5.7 },
  { value: 'memory', label: 'Memória Viva', icon: Brain, customIndex: 5.9 },
  { value: 'scoring', label: 'Scoring & LGPD', icon: TrendingUp, customIndex: 6 },
  { value: 'purchases', label: 'Compras & Propostas', icon: ShoppingBag, customIndex: 6.2 },
  { value: 'notes', label: 'Notas Privadas', icon: FileText, customIndex: 6 },
  { value: 'timeline', label: 'Linha do Tempo', icon: GitBranch, customIndex: 6.8 },
  { value: 'history', label: 'Histórico', icon: Clock, customIndex: 7 },
  { value: 'stats', label: 'Estatísticas', icon: BarChart3, customIndex: 8 },
  { value: 'media', label: 'Mídia Compartilhada', icon: Image, customIndex: 8 },
];

/**
 * Abre somente a secao essencial. Cada secao pesada monta hooks de dados;
 * abrir todas em paralelo causava fan-out de dezenas de requests ao trocar de
 * contato e saturava o semaforo local antes da primeira pagina de mensagens.
 */
export const DEFAULT_OPEN_SECTIONS = ['info'];

const ACCORDION_STORAGE_KEY = 'contact-details-accordion-state';

const LEGACY_EAGER_DEFAULTS = [
  [
    'info',
    'crm-360',
    'intelligence',
    'tags',
    'assignment',
    'custom-fields',
    'notes',
    'history',
    'stats',
  ],
  [
    'info',
    'crm-360',
    'intelligence',
    'tags',
    'assignment',
    'custom-fields',
    'notes',
    'history',
    'sla-timeline',
    'stats',
  ],
] as const;

const KNOWN_SECTION_VALUES = new Set([
  ...CONTACT_DETAIL_SECTIONS.map((section) => section.value),
  'custom-fields',
  'delivery-stats',
  'sla-timeline',
]);

function isLegacyEagerDefault(value: string[]): boolean {
  return LEGACY_EAGER_DEFAULTS.some(
    (legacy) => legacy.length === value.length && legacy.every((section) => value.includes(section))
  );
}

/** get Stored Accordion State function. */
export function getStoredAccordionState(): string[] {
  try {
    const stored = localStorage.getItem(ACCORDION_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (section): section is string =>
            typeof section === 'string' && KNOWN_SECTION_VALUES.has(section)
        )
      ) {
        if (isLegacyEagerDefault(parsed)) {
          saveAccordionState(DEFAULT_OPEN_SECTIONS);
          return [...DEFAULT_OPEN_SECTIONS];
        }
        return parsed;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return [...DEFAULT_OPEN_SECTIONS];
}

/** Persists the current accordion open-section list to localStorage. */
export function saveAccordionState(value: string[]) {
  try {
    localStorage.setItem(ACCORDION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
