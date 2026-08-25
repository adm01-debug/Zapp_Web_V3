import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ReactionBadge,
  ReactionPicker,
  MessageReactionBar,
  WHATSAPP_EMOJIS,
  EXTENDED_EMOJIS,
} from '../message-reactions';
import type { ReactionGroup } from '../message-reactions';

const MOCK_REACTION: ReactionGroup = {
  emoji: '👍',
  count: 3,
  users: ['Ana', 'Bruno', 'Carla'],
  reactedByMe: false,
};

const MOCK_REACTION_MINE: ReactionGroup = {
  emoji: '❤️',
  count: 1,
  reactedByMe: true,
};

describe('WHATSAPP_EMOJIS', () => {
  it('tem 6 emojis', () => expect(WHATSAPP_EMOJIS).toHaveLength(6));
  it('começa com 👍', () => expect(WHATSAPP_EMOJIS[0]).toBe('👍'));
});

describe('EXTENDED_EMOJIS', () => {
  it('tem pelo menos 12 emojis', () => expect(EXTENDED_EMOJIS.length).toBeGreaterThanOrEqual(12));
  it('inclui todos os WHATSAPP_EMOJIS', () => {
    WHATSAPP_EMOJIS.forEach((e) => expect(EXTENDED_EMOJIS).toContain(e));
  });
});

describe('ReactionBadge', () => {
  it('renderiza emoji e contador', () => {
    const onClick = vi.fn();
    render(<ReactionBadge reaction={MOCK_REACTION} onClick={onClick} />);
    expect(screen.getByText('👍')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('não mostra contador quando count=1', () => {
    const onClick = vi.fn();
    render(<ReactionBadge reaction={{ ...MOCK_REACTION, count: 1 }} onClick={onClick} />);
    expect(screen.queryByText('1')).toBeNull();
  });

  it('chama onClick com o emoji correto', () => {
    const onClick = vi.fn();
    render(<ReactionBadge reaction={MOCK_REACTION} onClick={onClick} messageId="m1" />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith('👍');
  });

  it('aria-pressed=true quando reactedByMe', () => {
    const onClick = vi.fn();
    render(<ReactionBadge reaction={MOCK_REACTION_MINE} onClick={onClick} />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('data-testid correto quando messageId fornecido', () => {
    const onClick = vi.fn();
    render(<ReactionBadge reaction={MOCK_REACTION} onClick={onClick} messageId="msg123" />);
    expect(screen.getByTestId('reaction-msg123-👍')).toBeDefined();
  });
});

describe('ReactionPicker', () => {
  it('renderiza todos os emojis padrão', () => {
    const onPick = vi.fn();
    render(<ReactionPicker onPick={onPick} />);
    const buttons = screen.getAllByRole('gridcell');
    expect(buttons.length).toBe(EXTENDED_EMOJIS.length);
  });

  it('renderiza emojis customizados', () => {
    const onPick = vi.fn();
    render(<ReactionPicker emojis={['😀', '😂']} onPick={onPick} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(2);
  });

  it('chama onPick ao clicar', () => {
    const onPick = vi.fn();
    render(<ReactionPicker emojis={['👍']} onPick={onPick} />);
    fireEvent.click(screen.getByRole('gridcell'));
    expect(onPick).toHaveBeenCalledWith('👍');
  });
});

describe('MessageReactionBar', () => {
  it('renderiza data-testid do container', () => {
    const onReact = vi.fn();
    render(<MessageReactionBar messageId="m1" reactions={[]} onReact={onReact} />);
    expect(screen.getByTestId('reactions-container-m1')).toBeDefined();
  });

  it('renderiza badges para cada reação', () => {
    const onReact = vi.fn();
    render(
      <MessageReactionBar
        messageId="m1"
        reactions={[MOCK_REACTION, MOCK_REACTION_MINE]}
        onReact={onReact}
      />
    );
    expect(screen.getByText('👍')).toBeDefined();
    expect(screen.getByText('❤️')).toBeDefined();
  });

  it('trigger do picker sempre renderiza', () => {
    const onReact = vi.fn();
    render(<MessageReactionBar messageId="m1" reactions={[]} onReact={onReact} />);
    expect(screen.getByTestId('reaction-trigger-m1')).toBeDefined();
  });

  it('role=group com aria-label', () => {
    const onReact = vi.fn();
    render(<MessageReactionBar messageId="m1" reactions={[]} onReact={onReact} />);
    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-label')).toBe('Reações da mensagem');
  });
});
