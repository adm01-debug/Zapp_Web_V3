import { motion } from '@/components/ui/motion';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import type { ThemePreset } from './presets';

interface PresetCardProps {
  preset: ThemePreset;
  isActive: boolean;
  onSelect: (id: string) => void;
}

/** Preset Card component for the settings section. */
export function PresetCard({ preset, isActive, onSelect }: PresetCardProps) {
  return (
    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
      <Card
        className={`cursor-pointer border-2 transition-all ${
          isActive
            ? 'border-primary shadow-lg shadow-primary/20'
            : 'border-secondary/20 hover:border-primary/40'
        }`}
        onClick={() => onSelect(preset.id)}
      >
        <CardContent className="p-3">
          {/* Color bar preview */}
          <div className="mb-2.5 flex h-7 overflow-hidden rounded-md ring-1 ring-border/30">
            {preset.swatches.map((swatch, i) => (
              <div key={`${swatch}-${i}`} className="flex-1" style={{ backgroundColor: swatch }} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <span>{preset.emoji}</span>
                <span className="truncate">{preset.name}</span>
              </p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {preset.description}
              </p>
            </div>
            {isActive && (
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
