import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Star, MessageSquareHeart, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCSAT } from '@/hooks/useCSAT';
import { motion } from '@/components/ui/motion';

const ratingColors: Record<number, string> = {
  1: 'bg-destructive',
  2: 'bg-warning',
  3: 'bg-warning',
  4: 'bg-success/70',
  5: 'bg-success',
};

/** CSATDashboard component for the csat section. */
export function CSATDashboard() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month');
  const { stats, surveys, isLoading } = useCSAT(period);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const avgScore = stats?.average || 0;
  const total = stats?.total || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquareHeart className="h-5 w-5 text-primary" />
          Satisfação do Cliente (CSAT)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs
          value={period}
          onValueChange={(v) =>
            setPeriod(
              v as typeof period /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
            )
          }
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Hoje</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Score Overview */}
        <div className="flex items-center gap-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex flex-col items-center"
          >
            <span className="text-4xl font-bold text-foreground">{avgScore.toFixed(1)}</span>
            <div className="mt-1 flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={cn(
                    'h-4 w-4',
                    star <= Math.round(avgScore)
                      ? 'fill-warning text-warning'
                      : 'text-muted-foreground/20'
                  )}
                />
              ))}
            </div>
            <span className="mt-1 text-xs text-muted-foreground">{total} avaliações</span>
          </motion.div>

          {/* Distribution */}
          <div className="flex-1 space-y-2">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = stats?.distribution[rating] || 0;
              const percentage = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={rating} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-muted-foreground">{rating}</span>
                  <Star className="h-3 w-3 fill-warning text-warning" />
                  <div className="flex-1">
                    <Progress
                      value={percentage}
                      className={cn('h-2', `[&>div]:${ratingColors[rating]}`)}
                    />
                  </div>
                  <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Feedback */}
        {surveys.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Feedbacks Recentes
            </h4>
            <div className="max-h-40 space-y-2 overflow-auto">
              {surveys
                .filter((s) => s.feedback)
                .slice(0, 5)
                .map((survey) => (
                  <div
                    key={survey.id}
                    className="flex items-start gap-2 rounded-lg bg-muted/30 p-2 text-sm"
                  >
                    <div className="mt-0.5 flex shrink-0 gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={cn(
                            'h-3 w-3',
                            star <= survey.rating
                              ? 'fill-warning text-warning'
                              : 'text-muted-foreground/20'
                          )}
                        />
                      ))}
                    </div>
                    <p className="line-clamp-2 text-muted-foreground">{survey.feedback}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
