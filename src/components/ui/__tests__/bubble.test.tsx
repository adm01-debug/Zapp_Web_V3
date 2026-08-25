import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Bubble, bubbleVariants } from '../bubble';

describe('Bubble', () => {
  it('renderiza filhos', () => {
    render(<Bubble>Olá</Bubble>);
    expect(screen.getByText('Olá')).toBeDefined();
  });

  it('side=sent aplica classe correta', () => {
    render(
      <Bubble side="sent" data-testid="b">
        msg
      </Bubble>
    );
    const el = screen.getByTestId('b');
    expect(el.className).toContain('ml-auto');
    expect(el.className).toContain('bg-chat-sent');
  });

  it('side=received é o default', () => {
    render(<Bubble data-testid="b">msg</Bubble>);
    const el = screen.getByTestId('b');
    expect(el.className).toContain('mr-auto');
    expect(el.className).toContain('bg-chat-received');
  });

  it('motion-reduce:transition-none presente para acessibilidade', () => {
    render(<Bubble data-testid="b">msg</Bubble>);
    const el = screen.getByTestId('b');
    expect(el.className).toContain('motion-reduce:transition-none');
  });

  it('bubbleVariants exporta a função cva', () => {
    const cls = bubbleVariants({ side: 'sent' });
    expect(cls).toContain('ml-auto');
  });

  it('aceita className customizada', () => {
    render(
      <Bubble className="custom-class" data-testid="b">
        msg
      </Bubble>
    );
    expect(screen.getByTestId('b').className).toContain('custom-class');
  });
});
