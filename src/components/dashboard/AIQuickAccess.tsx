import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { useNavigate } from 'react-router-dom';
import {
  Brain,
  Sparkles,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  FileText,
  Mic,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  route?: string;
  action?: string;
  gradient: string;
  badge?: string;
}

const aiFeatures: AIFeature[] = [
  {
    id: 'suggestions',
    title: 'Sugestões de Resposta',
    description: 'IA gera respostas personalizadas para cada conversa',
    icon: Sparkles,
    action: 'inbox',
    gradient: 'from-primary to-warning',
    badge: 'Popular',
  },
  {
    id: 'analysis',
    title: 'Análise de Conversa',
    description: 'Resumo, sentimento e pontos-chave automáticos',
    icon: Brain,
    action: 'inbox',
    gradient: 'from-secondary to-primary',
  },
  {
    id: 'sentiment',
    title: 'Alertas de Sentimento',
    description: 'Monitore conversas com sentimento negativo',
    icon: AlertTriangle,
    route: '/sentiment-alerts',
    gradient: 'from-warning to-warning',
    badge: 'Novo',
  },
  {
    id: 'summary',
    title: 'Resumo Automático',
    description: 'Gere resumos de conversas longas instantaneamente',
    icon: FileText,
    action: 'inbox',
    gradient: 'from-info to-info',
  },
  {
    id: 'transcription',
    title: 'Transcrição de Áudio',
    description: 'Converta mensagens de áudio em texto',
    icon: Mic,
    action: 'inbox',
    gradient: 'from-success to-success',
  },
  {
    id: 'trends',
    title: 'Tendências de Sentimento',
    description: 'Acompanhe a evolução do sentimento dos clientes',
    icon: TrendingUp,
    route: '/sentiment-alerts',
    gradient: 'from-coins to-warning',
  },
];

/** AIQuick Access component for the dashboard section. */
export function AIQuickAccess() {
  const navigate = useNavigate();
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);

  const handleFeatureClick = (feature: AIFeature) => {
    if (feature.route) {
      navigate(feature.route);
    } else if (feature.action === 'inbox') {
      navigate('/');
      // Small delay to ensure navigation, then switch to inbox tab
      setTimeout(() => {
        const inboxTab = document.querySelector('[data-tab="inbox"]') as HTMLElement;
        if (inboxTab) inboxTab.click();
      }, 100);
    }
  };

  return (
    <Card className="overflow-hidden border-secondary/20 bg-card transition-all duration-300 hover:border-secondary/40">
      <CardHeader className="border-b border-secondary/20 bg-gradient-to-r from-secondary/10 to-primary/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--primary)))',
              }}
              animate={{
                boxShadow: [
                  '0 0 20px hsl(var(--secondary) / 0.3)',
                  '0 0 40px hsl(var(--primary) / 0.4)',
                  '0 0 20px hsl(var(--secondary) / 0.3)',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Brain className="h-5 w-5 text-primary-foreground" />
            </motion.div>
            <div>
              <CardTitle className="flex items-center gap-2 font-display text-lg text-foreground">
                Inteligência Artificial
                <Badge
                  variant="secondary"
                  className="border-0 bg-secondary/20 text-xs text-secondary"
                >
                  <Activity className="mr-1 h-3 w-3" />
                  Ativo
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Acesso rápido às funcionalidades de IA
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {aiFeatures.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredFeature(feature.id)}
              onMouseLeave={() => setHoveredFeature(null)}
            >
              <Button
                variant="ghost"
                className={cn(
                  'flex h-auto w-full flex-col items-start gap-2 rounded-xl border p-4 transition-all duration-300',
                  'border-border/30 bg-muted/30 hover:border-primary/30 hover:bg-primary/5',
                  hoveredFeature === feature.id && 'border-primary/50 bg-primary/10'
                )}
                onClick={() => handleFeatureClick(feature)}
              >
                <div className="flex w-full items-start justify-between">
                  <motion.div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      `bg-gradient-to-br ${feature.gradient}`
                    )}
                    animate={
                      hoveredFeature === feature.id
                        ? { scale: 1.1, rotate: 5 }
                        : { scale: 1, rotate: 0 }
                    }
                    transition={{ duration: 0.2 }}
                  >
                    <feature.icon className="h-5 w-5 text-primary-foreground" />
                  </motion.div>

                  <div className="flex items-center gap-2">
                    {feature.badge && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          'px-1.5 py-0 text-[10px]',
                          feature.badge === 'Novo' && 'border-0 bg-success/20 text-success',
                          feature.badge === 'Popular' && 'border-0 bg-primary/20 text-primary'
                        )}
                      >
                        {feature.badge}
                      </Badge>
                    )}
                    <motion.div
                      animate={
                        hoveredFeature === feature.id
                          ? { x: 4, opacity: 1 }
                          : { x: 0, opacity: 0.5 }
                      }
                      transition={{ duration: 0.2 }}
                    >
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </motion.div>
                  </div>
                </div>

                <div className="text-left">
                  <h4 className="text-sm font-semibold text-foreground">{feature.title}</h4>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-4 border-t border-border/30 pt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 animate-pulse rounded-full bg-success" />
                <span>Modelo: Gemini 2.5 Flash</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" />
                <span>Análises disponíveis</span>
              </div>
            </div>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-primary"
              onClick={() => navigate('/sentiment-alerts')}
            >
              Ver todas as análises →
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
