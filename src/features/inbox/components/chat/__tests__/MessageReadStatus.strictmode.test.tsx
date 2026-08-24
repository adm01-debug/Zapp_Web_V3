/**
 * E17 — A7: MessageReadStatus em StrictMode.
 *
 * O useEffect rastreia transição unread→read. Em StrictMode o React monta,
 * desmonta e remonta — o efeito NÃO deve disparar o log duplicado porque
 * wasReadRef persiste durante o remount (é uma ref, não state).
 *
 * Regra: 0 logs na re-renderização sem mudança de mensagem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { StrictMode } from 'react';
import type { Message } from '@/types/chat';

// Mock o logger para contar chamadas
const mockLog = { info: vi.fn() };
vi.mock('@/lib/logger', () => ({ getLogger: () => mockLog }));
vi.mock('@/features/inbox/hooks/useInboxStatusPref', () => ({
  useInboxStatusPref: () => ({ showLabel: false }),
}));
// MessageStatusPanel renderiza filhos
vi.mock('./MessageStatusPanel', () => ({
  MessageStatusPanel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const makeMsg = (isRead: boolean): Message =>
  ({
    id: 'msg-test-001',
    sender: 'contact',
    timestamp: new Date(),
    is_read: isRead,
    contact_read_at: null,
    type: 'text',
    content: 'oi',
  }) as unknown as Message;

describe('MessageReadStatus — StrictMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('dispara log EXATAMENTE 1 vez na transição unread→read, não em re-renders', async () => {
    // Importa após o mock estar registrado
    const { MessageReadStatus } = await import('../MessageReadStatus');
    const unreadMsg = makeMsg(false);
    const readMsg = makeMsg(true);

    const { rerender } = render(
      <StrictMode>
        <MessageReadStatus message={unreadMsg} />
      </StrictMode>
    );

    expect(mockLog.info).not.toHaveBeenCalled();

    await act(async () => {
      rerender(
        <StrictMode>
          <MessageReadStatus message={readMsg} />
        </StrictMode>
      );
    });

    // Deve ter disparado 1 log (transição) — StrictMode re-executa mas a ref
    // já está setada, portanto o segundo disparo é bloqueado
    expect(mockLog.info).toHaveBeenCalledTimes(1);

    // Re-render adicional com a mesma mensagem lida: 0 logs adicionais
    await act(async () => {
      rerender(
        <StrictMode>
          <MessageReadStatus message={readMsg} />
        </StrictMode>
      );
    });

    expect(mockLog.info).toHaveBeenCalledTimes(1);
  });
});
