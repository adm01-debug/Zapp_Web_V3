import { Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Phone } from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { toast } from 'sonner';

interface CompactContactHeaderProps {
  contact: { name: string; phone: string; avatar?: string };
  isVip: boolean;
  companyName?: string;
  firstName: string;
}

/** Compact Contact Header component for the contact details section. */
export function CompactContactHeader({
  contact,
  isVip,
  companyName,
  firstName,
}: CompactContactHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 border-b border-border/10 bg-background px-4 py-2.5"
    >
      <div className="relative">
        <Avatar className="h-[44px] w-[44px] shadow-sm ring-1 ring-border/20">
          <AvatarImage src={contact.avatar} alt={contact.name} />
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {contact.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        {isVip && <Crown className="absolute -right-0.5 -top-0.5 h-3 w-3 text-warning" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{firstName}</span>
          {companyName && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="truncate text-xs text-muted-foreground">{companyName}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Copiar telefone"
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-primary/10"
                onClick={() => {
                  navigator.clipboard.writeText(contact.phone);
                  toast.success('Telefone copiado!');
                }}
              >
                <Phone className="h-3.5 w-3.5 text-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar telefone</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </motion.div>
  );
}
