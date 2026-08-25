/* eslint-disable react-refresh/only-export-components */
import { useMemo } from 'react';
import { motion } from '@/components/ui/motion';
import { Award, Zap, BarChart3, Sparkles, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AchievementBadgeMini } from './AchievementBadge';
import type { Achievement } from '@/features/admin';
import { levelProgress, xpForNextLevel } from '@/features/admin';

interface AchievementsStatsProps {
  achievements: Achievement[];
  stats: { level: number; xp: number } | null;
}

/** is New Achievement component for the gamification section. */
export function isNewAchievement(earnedAt: string): boolean {
  return new Date(earnedAt) > new Date(Date.now() - 60 * 60 * 1000);
}

/** Achievements Stats Header component for the gamification section. */
export function AchievementsStatsHeader({ achievements, stats }: AchievementsStatsProps) {
  const totalXp = useMemo(
    () => achievements.reduce((sum, a) => sum + a.xp_earned, 0),
    [achievements]
  );
  const uniqueTypes = useMemo(
    () => Array.from(new Set(achievements.map((a) => a.achievement_type))),
    [achievements]
  );

  return (
    <>
      {/* Level Progress */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Progresso para Nível {stats.level + 1}
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.xp.toLocaleString()} / {xpForNextLevel(stats.level).toLocaleString()} XP
            </span>
          </div>
          <Progress value={levelProgress(stats.xp, stats.level)} className="h-2" />
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          {
            icon: Award,
            color: 'text-primary',
            label: 'Total',
            value: achievements.length,
            delay: 0.1,
          },
          {
            icon: Zap,
            color: 'text-xp',
            label: 'XP Ganho',
            value: totalXp.toLocaleString(),
            delay: 0.15,
          },
          {
            icon: BarChart3,
            color: 'text-info',
            label: 'Tipos',
            value: uniqueTypes.length,
            delay: 0.2,
          },
          {
            icon: Sparkles,
            color: 'text-warning',
            label: 'Recentes',
            value: achievements.filter((a) => isNewAchievement(a.earned_at)).length,
            delay: 0.25,
          },
        ].map(({ icon: Icon, color, label, value, delay }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay }}
            className="rounded-xl border border-border/30 bg-muted/30 p-4"
          >
            <div className="mb-1 flex items-center gap-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </motion.div>
        ))}
      </div>

      {/* Mini badges showcase */}
      {achievements.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
          <h4 className="mb-3 text-sm font-medium text-foreground">Últimas Conquistas</h4>
          <div className="flex flex-wrap gap-2">
            {achievements.slice(0, 10).map((achievement, index) => (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <AchievementBadgeMini
                  type={achievement.achievement_type}
                  name={achievement.achievement_name}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Achievements Header Badges component for the gamification section. */
export function AchievementsHeaderBadges({
  stats,
}: {
  stats: { level: number; xp: number } | null;
}) {
  if (!stats) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-1 border-0 bg-primary/10 text-primary">
        <TrendingUp className="h-3 w-3" />
        Nv {stats.level}
      </Badge>
      <Badge variant="secondary" className="gap-1 border-0 bg-xp/10 text-xp">
        <Zap className="h-3 w-3" />
        {stats.xp.toLocaleString()} XP
      </Badge>
    </div>
  );
}
