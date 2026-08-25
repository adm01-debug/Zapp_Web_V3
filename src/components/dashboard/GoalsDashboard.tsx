import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Target,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Flame,
  Trophy,
  Zap,
  Calendar,
  Settings,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { GoalsConfigDialog } from './GoalsConfigDialog';
import { CelebrationOverlay } from '@/components/effects/Confetti';
import {
  useGoalsDashboard,
  getProgressColor,
  getProgressBgColor,
  PERIOD_OPTIONS,
} from '@/hooks/useGoalsDashboard';

/** Goals Dashboard component for the dashboard section. */
export function GoalsDashboard() {
  const {
    period,
    setPeriod,
    configDialogOpen,
    setConfigDialogOpen,
    showCelebration,
    setShowCelebration,
    celebrationData,
    goals,
    overallProgress,
    completedGoals,
    isLoading,
    dateRange,
  } = useGoalsDashboard();

  return (
    <div className="space-y-6">
      <CelebrationOverlay
        isActive={showCelebration}
        title={celebrationData.title}
        subtitle={celebrationData.subtitle}
        emoji={celebrationData.emoji}
        onComplete={() => setShowCelebration(false)}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Target className="h-6 w-6 text-primary" />
            Dashboard de Metas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe seu progresso em tempo real
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigDialogOpen(true)}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Configurar Metas
          </Button>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <GoalsConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
          <CardContent className="p-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-32" />
              </div>
            ) : (
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-xl bg-primary/20 p-3">
                      <Trophy className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Progresso Geral</h3>
                      <p className="text-sm text-muted-foreground">
                        {completedGoals} de {goals.length} metas concluídas
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className={cn('font-bold', getProgressColor(overallProgress))}>
                        {overallProgress}%
                      </span>
                    </div>
                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn('h-full rounded-full', getProgressBgColor(overallProgress))}
                        initial={{ width: 0 }}
                        animate={{ width: `${overallProgress}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {overallProgress >= 100 ? (
                    <div className="flex items-center gap-2 rounded-lg bg-success/20 px-4 py-2">
                      <Flame className="h-5 w-5 text-success" />
                      <span className="font-medium text-success">Todas as metas alcançadas!</span>
                    </div>
                  ) : overallProgress >= 75 ? (
                    <div className="flex items-center gap-2 rounded-lg bg-primary/20 px-4 py-2">
                      <Zap className="h-5 w-5 text-primary" />
                      <span className="font-medium text-primary">Quase lá!</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                      <TrendingUp className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">Continue assim!</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal, index) => {
          const percentage = Math.min(Math.round((goal.current / goal.target) * 100), 100);
          const isCompleted = goal.current >= goal.target;
          const Icon = goal.icon;
          return (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className={cn(
                  'relative overflow-hidden transition-all hover:shadow-lg',
                  isCompleted && 'border-success/50 bg-success/5'
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="rounded-lg p-2"
                        style={{ backgroundColor: `${goal.color}20` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: goal.color }} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{goal.label}</CardTitle>
                        <p className="text-xs text-muted-foreground">{goal.description}</p>
                      </div>
                    </div>
                    {isCompleted && (
                      <Badge
                        variant="outline"
                        className="border-success/30 bg-success/10 text-success"
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Concluída
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex items-end gap-2">
                        <span className="text-3xl font-bold text-foreground">
                          {goal.current.toLocaleString()}
                        </span>
                        <span className="mb-1 text-sm text-muted-foreground">
                          / {goal.target.toLocaleString()} {goal.unit}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progresso</span>
                          <span className={cn('font-medium', getProgressColor(percentage))}>
                            {percentage}%
                          </span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: goal.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.8, delay: index * 0.1, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                      {!isCompleted && (
                        <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                          <AlertCircle className="h-3 w-3" />
                          Faltam {(goal.target - goal.current).toLocaleString()} {goal.unit}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
                <div
                  className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
                  style={{ backgroundColor: goal.color }}
                />
              </Card>
            </motion.div>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-primary/10 p-3">
                <Flame className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {overallProgress >= 100
                    ? '🎉 Parabéns! Você alcançou todas as metas!'
                    : overallProgress >= 75
                      ? '💪 Excelente progresso! Continue focado!'
                      : overallProgress >= 50
                        ? '🚀 Você está no caminho certo!'
                        : '✨ Cada passo conta! Vamos em frente!'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Período: {format(dateRange.from, "dd 'de' MMMM", { locale: ptBR })} -{' '}
                  {format(dateRange.to, "dd 'de' MMMM", { locale: ptBR })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
