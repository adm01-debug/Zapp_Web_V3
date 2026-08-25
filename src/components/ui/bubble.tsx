/**
 * E31 — Bubble: primitivo de bolha de chat portado de TW4→TW3.
 * Usado via flag chat_bubble_v2 em MessageBubble e ChatMessageBubble.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const bubbleVariants = cva('relative max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm', {
  variants: {
    side: {
      sent: 'ml-auto bg-chat-sent text-chat-sent-fg rounded-br-sm',
      received: 'mr-auto bg-chat-received text-chat-received-fg rounded-bl-sm',
    },
  },
  defaultVariants: { side: 'received' },
});

interface BubbleProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof bubbleVariants> {}

export function Bubble({ className, side, ...props }: BubbleProps) {
  return (
    <div
      className={cn(
        bubbleVariants({ side }),
        'motion-reduce:animate-none motion-reduce:transition-none',
        className
      )}
      {...props}
    />
  );
}
