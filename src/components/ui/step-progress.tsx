import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { motion } from '@/components/ui/motion';

/** Step component for the ui section. */
export interface Step {
  label: string;
  description?: string;
}

interface StepProgressProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

/** Step Progress component for the ui section. */
export function StepProgress({ steps, currentStep, className }: StepProgressProps) {
  return (
    <nav aria-label="Progresso" className={cn('flex items-center gap-1', className)}>
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isCurrent = idx === currentStep;

        return (
          <div key={idx} className="flex items-center gap-1">
            {/* Step circle */}
            <div className="flex items-center gap-1.5">
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                  backgroundColor: isCompleted
                    ? 'hsl(var(--primary))'
                    : isCurrent
                      ? 'hsl(var(--primary) / 0.15)'
                      : 'hsl(var(--muted))',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors',
                  isCompleted && 'border-primary text-primary-foreground',
                  isCurrent && 'border-primary text-primary',
                  !isCompleted &&
                    !isCurrent &&
                    'border-muted-foreground/20 text-muted-foreground/40'
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : idx + 1}
              </motion.div>
              <span
                className={cn(
                  'hidden whitespace-nowrap text-[11px] font-medium sm:inline',
                  isCurrent && 'text-foreground',
                  isCompleted && 'text-primary',
                  !isCompleted && !isCurrent && 'text-muted-foreground/40'
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="mx-0.5 h-0.5 w-6 overflow-hidden rounded-full bg-muted-foreground/10">
                <motion.div
                  initial={false}
                  animate={{ width: isCompleted ? '100%' : '0%' }}
                  transition={{ duration: 0.3 }}
                  className="h-full rounded-full bg-primary"
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
