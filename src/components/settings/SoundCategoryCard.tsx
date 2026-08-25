import { motion } from '@/components/ui/motion';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface SoundOption {
  id: string;
  name: string;
  description: string;
}

interface SoundCategoryCardProps {
  categoryKey: string;
  label: string;
  description: string;
  icon: React.ElementType;
  sounds: SoundOption[];
  currentSound: string;
  isPlaying: boolean;
  disabled: boolean;
  onSoundChange: (category: string, soundId: string) => void;
  onPlayPreview: (category: string, soundId: string) => void;
}

/** Sound Category Card component for the settings section. */
export function SoundCategoryCard({
  categoryKey,
  label,
  description,
  icon: Icon,
  sounds,
  currentSound,
  isPlaying,
  disabled,
  onSoundChange,
  onPlayPreview,
}: SoundCategoryCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={cn(
          'transition-all hover:border-primary/30',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'shrink-0 rounded-lg p-2.5',
                isPlaying ? 'animate-pulse bg-primary/20' : 'bg-muted'
              )}
            >
              <Icon
                className={cn('h-5 w-5', isPlaying ? 'text-primary' : 'text-muted-foreground')}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium">{label}</h4>
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={currentSound}
                onValueChange={(value) => onSoundChange(categoryKey, value)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sounds.map((sound) => (
                    <SelectItem key={sound.id} value={sound.id}>
                      {sound.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                aria-label={isPlaying ? 'Pausar pré-visualização' : 'Reproduzir pré-visualização'}
                variant="ghost"
                size="icon"
                disabled={currentSound === 'none'}
                onClick={() => onPlayPreview(categoryKey, currentSound)}
                className="shrink-0"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
