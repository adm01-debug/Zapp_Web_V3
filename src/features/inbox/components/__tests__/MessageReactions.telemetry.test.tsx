import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageReactions, QuickReactionBar } from '../MessageReactions';

const mocks = vi.hoisted(() => ({
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  hasReacted: vi.fn(),
  trackReactionEvent: vi.fn(),
  useMessageReactions: vi.fn(),
  useReactionMutations: vi.fn(),
}));

vi.mock('@/components/ui/message-reactions', () => ({
  WHATSAPP_EMOJIS: ['👍'],
  EXTENDED_EMOJIS: ['👍', '❤️'],
  MessageReactionBar: ({ onReact }: { onReact: (emoji: string) => void | Promise<void> }) => (
    <button type="button" onClick={() => void onReact('👍')}>
      reagir-na-barra
    </button>
  ),
  QuickReactionStrip: ({ onReact }: { onReact: (emoji: string) => void | Promise<void> }) => (
    <button type="button" onClick={() => void onReact('👍')}>
      reagir-rapido
    </button>
  ),
}));

vi.mock('@/features/inbox/hooks/useMessageReactions', () => ({
  useMessageReactions: mocks.useMessageReactions,
}));

vi.mock('@/features/inbox/hooks/reactions/useReactionMutations', () => ({
  useReactionMutations: mocks.useReactionMutations,
}));

function arrangeReactionState(options?: { reactedByMe?: boolean }) {
  const reactedByMe = options?.reactedByMe ?? false;
  mocks.hasReacted.mockReturnValue(reactedByMe);
  mocks.useMessageReactions.mockReturnValue({
    reactions: reactedByMe ? [{ emoji: '👍', user_id: 'profile-1', user_name: 'Você' }] : [],
    addReaction: mocks.addReaction,
    removeReaction: mocks.removeReaction,
    hasReacted: mocks.hasReacted,
    currentProfileId: 'profile-1',
  });
}

describe('MessageReactions — ownership da telemetria', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addReaction.mockResolvedValue(undefined);
    mocks.removeReaction.mockResolvedValue(undefined);
    mocks.useReactionMutations.mockReturnValue({
      trackReactionEvent: mocks.trackReactionEvent,
    });
    arrangeReactionState();
  });

  it('delega adição ao hook sem criar um segundo mutation owner/analytics', async () => {
    render(<MessageReactions messageId="message-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'reagir-na-barra' }));

    await waitFor(() => expect(mocks.addReaction).toHaveBeenCalledWith('👍'));
    expect(mocks.addReaction).toHaveBeenCalledTimes(1);
    expect(mocks.useReactionMutations).not.toHaveBeenCalled();
    expect(mocks.trackReactionEvent).not.toHaveBeenCalled();
  });

  it('delega reação rápida sem emitir o evento de adição duas vezes', async () => {
    render(<QuickReactionBar messageId="message-2" />);

    fireEvent.click(screen.getByRole('button', { name: 'reagir-rapido' }));

    await waitFor(() => expect(mocks.addReaction).toHaveBeenCalledWith('👍'));
    expect(mocks.addReaction).toHaveBeenCalledTimes(1);
    expect(mocks.useReactionMutations).not.toHaveBeenCalled();
    expect(mocks.trackReactionEvent).not.toHaveBeenCalled();
  });

  it('preserva a remoção quando o perfil já reagiu', async () => {
    arrangeReactionState({ reactedByMe: true });
    render(<MessageReactions messageId="message-3" />);

    fireEvent.click(screen.getByRole('button', { name: 'reagir-na-barra' }));

    await waitFor(() => expect(mocks.removeReaction).toHaveBeenCalledWith('👍'));
    expect(mocks.addReaction).not.toHaveBeenCalled();
  });
});
