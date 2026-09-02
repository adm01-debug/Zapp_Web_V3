/**
 * E24 — anti-drift: garante que os 4 tokens E23 existem em tailwind.config.ts
 */
import { describe, it, expect } from 'vitest';

describe('E24 — chat design tokens presentes em tailwind.config', () => {
  it('contém as 4 chaves E23 em theme.extend.colors', async () => {
    const { default: config } = await import('../../../tailwind.config.ts');
    const colors = config.theme?.extend?.colors as Record<string, unknown>;
    expect(colors).toHaveProperty('chat-sent');
    expect(colors).toHaveProperty('chat-sent-fg');
    expect(colors).toHaveProperty('chat-received');
    expect(colors).toHaveProperty('chat-received-fg');
  });
});
