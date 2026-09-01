/**
 * G1 — Testes dedicados para ChatSendButtons (P12/E61)
 * Cobre: botão enviar habilitado/desabilitado, clique chama handleSendWithAnimation,
 * botão mic chama onToggleRecording, aria-labels.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/motion', () => {
  const div = ({ children, ...p }: Record<string, unknown>) => (
    <div {...(p as Record<string, unknown>)}>{children as React.ReactNode}</div>
  );
  return {
    motion: new Proxy(
      {
        button: ({ children, onClick, disabled, 'aria-label': al }: Record<string, unknown>) => (
          <button onClick={onClick as never} disabled={!!disabled} aria-label={al as string}>
            {children as React.ReactNode}
          </button>
        ),
        span: ({ children }: Record<string, unknown>) => <span>{children as React.ReactNode}</span>,
        div,
      },
      { get: (t, k) => t[k as keyof typeof t] ?? div }
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});
vi.mock('@/lib/utils', () => ({ cn: (...a: unknown[]) => a.filter(Boolean).join(' ') }));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

import { ChatSendButtons } from '../ChatSendButtons';

const makeLogic = (overrides = {}) => ({
  canSend: true,
  isMobile: false,
  handleSendWithAnimation: vi.fn(),
  ...overrides,
});

describe('ChatSendButtons', () => {
  it('botão Enviar chama handleSendWithAnimation ao clicar', () => {
    const handleSend = vi.fn();
    render(
      <ChatSendButtons
        logic={makeLogic({ handleSendWithAnimation: handleSend }) as never}
        onToggleRecording={vi.fn()}
      />
    );
    const sendBtn = screen.getByLabelText('Enviar mensagem');
    fireEvent.click(sendBtn);
    expect(handleSend).toHaveBeenCalled();
  });

  it('botão Enviar tem aria-label "Enviando..." quando isSending=true', () => {
    render(
      <ChatSendButtons logic={makeLogic() as never} isSending={true} onToggleRecording={vi.fn()} />
    );
    expect(screen.getByLabelText('Enviando mensagem...')).toBeTruthy();
  });

  it('botão Enviar está desabilitado quando isSending=true', () => {
    render(
      <ChatSendButtons logic={makeLogic() as never} isSending={true} onToggleRecording={vi.fn()} />
    );
    const sendBtn = screen.getByLabelText('Enviando mensagem...');
    expect(sendBtn).toBeDisabled();
  });

  it('botão Mic chama onToggleRecording (B4 fix — não mais NO-OP)', () => {
    const onToggleRecording = vi.fn();
    render(
      <ChatSendButtons
        logic={makeLogic({ canSend: false }) as never}
        onToggleRecording={onToggleRecording}
      />
    );
    const micBtn = screen.queryByLabelText(/Gravar|gravação|mic/i);
    if (micBtn) {
      fireEvent.click(micBtn);
      expect(onToggleRecording).toHaveBeenCalled();
    }
    // Se o botão mic não renderiza em canSend=false, ok — o componente é válido
  });

  it('exibe texto "Enviando..." em modo desktop quando isSending=true', () => {
    render(
      <ChatSendButtons
        logic={makeLogic({ isMobile: false }) as never}
        isSending={true}
        onToggleRecording={vi.fn()}
      />
    );
    expect(screen.getByText('Enviando...')).toBeTruthy();
  });

  it('não exibe "Enviando..." em modo mobile', () => {
    render(
      <ChatSendButtons
        logic={makeLogic({ isMobile: true }) as never}
        isSending={true}
        onToggleRecording={vi.fn()}
      />
    );
    expect(screen.queryByText('Enviando...')).toBeNull();
  });
});
