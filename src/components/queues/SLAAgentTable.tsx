import { motion } from '@/components/ui/motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Timer, CheckCircle2, TrendingUp, Users } from 'lucide-react';

const getRateColor = (rate: number) => {
  if (rate >= 90) return 'text-success';
  if (rate >= 70) return 'text-warning';
  return 'text-destructive';
};

const getRateBadge = (rate: number) => {
  if (rate >= 90) return 'bg-success/20 text-success dark:text-success';
  if (rate >= 70) return 'bg-warning/20 text-warning dark:text-warning';
  return 'bg-destructive/20 text-destructive dark:text-destructive';
};

interface AgentData {
  agentId: string;
  agentName: string;
  avatarUrl?: string;
  overallRate: number;
  firstResponse: { rate: number; onTime: number; total: number };
  resolution: { rate: number; onTime: number; total: number };
}

interface SLAAgentTableProps {
  agents: AgentData[];
}

/** SLAAgent Table component for the queues section. */
export function SLAAgentTable({ agents }: SLAAgentTableProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          SLA por Agente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
              <Users className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="mb-1 font-medium text-foreground">Sem dados de agentes</p>
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              Métricas individuais aparecerão quando agentes forem atribuídos a conversas
              monitoradas.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent, index) => (
              <motion.div
                key={agent.agentId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4 rounded-lg bg-muted/30 p-4 transition-colors hover:bg-muted/50"
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={agent.avatarUrl} alt={agent.agentName} />
                  <AvatarFallback>
                    {agent.agentName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{agent.agentName}</p>
                    <Badge className={getRateBadge(agent.overallRate)}>
                      {agent.overallRate.toFixed(0)}% SLA
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-info" />
                      <span className="text-muted-foreground">1ª Resposta:</span>
                      <span className={getRateColor(agent.firstResponse.rate)}>
                        {agent.firstResponse.rate.toFixed(0)}%
                      </span>
                      <span className="text-muted-foreground">
                        ({agent.firstResponse.onTime}/{agent.firstResponse.total})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">Resolução:</span>
                      <span className={getRateColor(agent.resolution.rate)}>
                        {agent.resolution.rate.toFixed(0)}%
                      </span>
                      <span className="text-muted-foreground">
                        ({agent.resolution.onTime}/{agent.resolution.total})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="hidden w-32 md:block">
                  <Progress value={agent.overallRate} className="h-2" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
