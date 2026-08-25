import { motion } from '@/components/ui/motion';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { WarRoomAgent } from '@/hooks/useWarRoomData';

const statusColors = {
  online: 'bg-success',
  busy: 'bg-warning',
  away: 'bg-muted-foreground',
  offline: 'bg-destructive',
};

interface AgentCardProps {
  agent: WarRoomAgent;
  onClick: () => void;
}

/** War Room Agent Card component for the dashboard section. */
export function WarRoomAgentCard({ agent, onClick }: AgentCardProps) {
  const isOverloaded = agent.activeChats >= agent.maxChats;
  const utilizationPercent = (agent.activeChats / agent.maxChats) * 100;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg border p-3 transition-all hover:shadow-md',
        isOverloaded && 'border-warning bg-warning/5'
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="relative">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {agent.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
              statusColors[agent.status]
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{agent.name}</div>
          <div className="text-xs capitalize text-muted-foreground">{agent.status}</div>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Chats</span>
          <span className={cn(isOverloaded && 'font-medium text-warning')}>
            {agent.activeChats}/{agent.maxChats}
          </span>
        </div>
        <Progress value={utilizationPercent} className="h-1.5" />
        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <div>
            <div className="text-muted-foreground">Resp.</div>
            <div className="font-medium">{agent.avgResponseTime}s</div>
          </div>
          <div>
            <div className="text-muted-foreground">Hoje</div>
            <div className="font-medium">{agent.resolvedToday}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
