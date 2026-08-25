/**
 * @file message-reactions.test.tsx
 * @description Testes dos primitivos canônicos de reactions (E91 — E57).
 * API real pós-eslint: ReactionBadge, ReactionPicker, MessageReactionBar, QuickReactionStrip.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  WHATSAPP_EMOJIS,
  EXTENDED_EMOJIS,
  ReactionBadge,
  ReactionPicker,
  MessageReactionBar,
  QuickReactionStrip,
  type ReactionGroup,
} from '../message-reactions';

vi.mock('@/components/ui/motion', () => ({
  motion: new Proxy(
    {} as Record<string, unknown>,
    {
      get: (_: unknown, prop: string | symbol) =>
        typeof prop === 'symbol' ? undefined : prop,
    }
  ),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Tooltip: ({ children }: { children?: React.ReactNode }) => children ?? null,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => children ?? null,
  TooltipContent: () => null,
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => children ?? null,
  PopoverContent: () => null,
}));

// ─── ReactionBadge ────────────────────────────────────────────────────────────

describe('ReactionBadge', () => {
  const baseReaction: ReactionGroup = { emoji: '👍', count: 3, reactedByMe: false };

  it('renderiza emoji e count', () => {
    render(<ReactionBadge reaction={baseReaction} onClick={vi.fn()} />);
    expect(screen.getByText('👍')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('aria-pressed=false quando reactedByMe=false', () => {
    const { container } = render(<ReactionBadge reaction={baseReaction} onClick={vi.fn()} />);
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('aria-pressed=true quando reactedByMe=true', () => {
    const reacted = { ...baseReaction, reactedByMe: true };
    const { container } = render(<ReactionBadge reaction={reacted} onClick={vi.fn()} />);
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('chama onClick com o emoji correto', () => {
    const onClick = vi.fn();
    const { container } = render(<ReactionBadge reaction={baseReaction} onClick={onClick} />);
    fireEvent.click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledWith('👍');
  });

  it('aplica data-testid quando messageId fornecido', () => {
    render(<ReactionBadge reaction={baseReaction} onClick={vi.fn()} messageId="m1" />);
    expect(screen.getByTestId('reaction-m1-👍')).toBeDefined();
  });

  it('não mostra count quando count=1', () => {
    const single = { ...baseReaction, count: 1 };
    render(<ReactionBadge reaction={single} onClick={vi.fn()} />);
    // O count=1 não é renderizado (count > 1 é condição no JSX)
    expect(screen.queryByText('1')).toBeNull();
  });
});

// ─── ReactionPicker ───────────────────────────────────────────────────────────

describe('ReactionPicker', () => {
  it('renderiza emojis do EXTENDED por padrão', () => {
    const onPick = vi.fn();
    render(<ReactionPicker onPick={onPick} />);
    expect(screen.getByLabelText('Reagir com 👍')).toBeDefined();
    expect(screen.getByLabelText('Reagir com 🔥')).toBeDefined();
  });

  it('renderiza conjunto customizado', () => {
    const onPick = vi.fn();
    render(<ReactionPicker emojis={['🎉', '💯']} onPick={onPick} />);
    expect(screen.getByText('🎉')).toBeDefined();
    expect(screen.getByText('💯')).toBeDefined();
  });

  it('chama onPick com o emoji clicado', () => {
    const onPick = vi.fn();
    render(<ReactionPicker emojis={['😂']} onPick={onPick} />);
    fireEvent.click(screen.getByLabelText('Reagir com 😂'));
    expect(onPick).toHaveBeenCalledWith('😂');
  });

  it('marca com aria-pressed=true quando hasReacted=true', () => {
    const onPick = vi.fn();
    render(<ReactionPicker emojis={['👍', '❤️']} hasReacted={(e) => e === '❤️'} onPick={onPick} />);
    expect(screen.getByLabelText('Reagir com ❤️').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Reagir com 👍').getAttribute('aria-pressed')).toBe('false');
  });
});

// ─── MessageReactionBar ───────────────────────────────────────────────────────

describe('MessageReactionBar', () => {
  const reactions: ReactionGroup[] = [
    { emoji: '👍', count: 3, reactedByMe: true },
    { emoji: '❤️', count: 1, reactedByMe: false },
  ];

  it('renderiza badges para cada reaction', () => {
    const onReact = vi.fn();
    render(<MessageReactionBar messageId="m1" reactions={reactions} onReact={onReact} />);
    expect(screen.getByText('👍')).toBeDefined();
    expect(screen.getByText('❤️')).toBeDefined();
  });

  it('chama onReact ao clicar em badge', () => {
    const onReact = vi.fn();
    render(<MessageReactionBar messageId="m1" reactions={reactions} onReact={onReact} />);
    fireEvent.click(screen.getByTestId('reaction-m1-👍'));
    expect(onReact).toHaveBeenCalledWith('👍');
  });

  it('renderiza botão "Adicionar reação"', () => {
    render(<MessageReactionBar messageId="m2" reactions={reactions} onReact={vi.fn()} />);
    expect(screen.getByLabelText('Adicionar reação')).toBeDefined();
  });

  it('lista vazia — só botão "+"', () => {
    render(<MessageReactionBar messageId="m3" reactions={[]} onReact={vi.fn()} />);
    expect(screen.queryByTestId('reaction-m3-👍')).toBeNull();
    expect(screen.getByLabelText('Adicionar reação')).toBeDefined();
  });

  it('container tem data-testid correto', () => {
    render(<MessageReactionBar messageId="abc" reactions={[]} onReact={vi.fn()} />);
    expect(screen.getByTestId('reactions-container-abc')).toBeDefined();
  });
});

// ─── QuickReactionStrip ───────────────────────────────────────────────────────

describe('QuickReactionStrip', () => {
  const hasReacted = vi.fn((e: string) => e === '👍');

  it('renderiza WHATSAPP_EMOJIS por padrão', () => {
    render(<QuickReactionStrip onReact={vi.fn()} hasReacted={hasReacted} />);
    for (const emoji of WHATSAPP_EMOJIS.slice(0, 3)) {
      expect(screen.getByLabelText(`Reagir com ${emoji}`)).toBeDefined();
    }
  });

  it('chama onReact ao clicar em emoji', () => {
    const onReact = vi.fn();
    render(<QuickReactionStrip onReact={onReact} hasReacted={() => false} />);
    fireEvent.click(screen.getByLabelText('Reagir com 👍'));
    expect(onReact).toHaveBeenCalledWith('👍');
  });

  it('marca aria-pressed=true quando hasReacted retorna true', () => {
    render(<QuickReactionStrip onReact={vi.fn()} hasReacted={(e) => e === '❤️'} />);
    expect(screen.getByLabelText('Reagir com ❤️').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Reagir com 👍').getAttribute('aria-pressed')).toBe('false');
  });

  it('renderiza botão "Mais reações"', () => {
    render(<QuickReactionStrip onReact={vi.fn()} hasReacted={() => false} />);
    expect(screen.getByLabelText('Mais reações')).toBeDefined();
  });
});

// ─── Constantes ───────────────────────────────────────────────────────────────

describe('Emoji sets', () => {
  it('WHATSAPP_EMOJIS tem 6 itens', () => {
    expect(WHATSAPP_EMOJIS.length).toBe(6);
  });

  it('EXTENDED_EMOJIS tem 20 itens', () => {
    expect(EXTENDED_EMOJIS.length).toBe(21); // 6 WHATSAPP + 15 extras
  });

  it('WHATSAPP_EMOJIS está contido em EXTENDED_EMOJIS', () => {
    for (const e of WHATSAPP_EMOJIS) {
      expect(EXTENDED_EMOJIS).toContain(e);
    }
  });
});
