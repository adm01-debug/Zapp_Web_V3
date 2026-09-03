/**
 * Regressão — data-testid faltantes no ChatScrollerV2, achados pela auditoria
 * adversarial de sessão (2026-09-01): e2e/inbox/chat-new-message-indicator.spec.ts
 * depende de [data-testid="chat-scroller"] e [data-testid="new-message-indicator"],
 * que não existiam. ChatScrollerV2.newmsg.test.tsx testa só a lógica do
 * indicador via uma reimplementação local (não o componente real), então não
 * cobre os atributos em si — este arquivo renderiza o componente real.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatScrollerV2 } from '../ChatScrollerV2';
import type { Message } from '@/types/chat';

vi.mock('@/lib/utils', () => ({ cn: (...a: unknown[]) => a.filter(Boolean).join(' ') }));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 100,
    getVirtualItems: () => [{ key: 'm1', index: 0, start: 0 }],
    measureElement: () => {},
    scrollToIndex: () => {},
    options: { scrollMargin: 0 },
  }),
}));

const makeMsg = (id = 'm1'): Message => ({
  id,
  conversationId: 'conv-1',
  content: 'oi',
  type: 'text',
  sender: 'agent',
  timestamp: new Date('2026-01-01T12:00:00Z'),
  status: 'sent',
});

describe('ChatScrollerV2 — data-testid (regressão e2e)', () => {
  it('expõe data-testid="chat-scroller" no container de scroll', () => {
    render(
      <ChatScrollerV2
        messages={[makeMsg()]}
        estimateSize={() => 50}
        renderItem={(msg) => <div>{msg.id}</div>}
      />
    );
    expect(screen.getByTestId('chat-scroller')).toBeTruthy();
  });

  it('expõe data-testid="new-message-indicator" quando fora do bottom com mensagens novas', () => {
    render(
      <ChatScrollerV2
        messages={[makeMsg()]}
        estimateSize={() => 50}
        renderItem={(msg) => <div>{msg.id}</div>}
        newMessageCount={2}
      />
    );
    const scroller = screen.getByTestId('chat-scroller');
    // Simula scroll para longe do fundo (scrollHeight - scrollTop - clientHeight >= 80)
    // para sair do atBottom=true inicial e revelar o indicador.
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scroller, 'scrollTop', { value: 0, configurable: true });
    fireEvent.scroll(scroller);

    expect(screen.getByTestId('new-message-indicator')).toBeTruthy();
  });
});
