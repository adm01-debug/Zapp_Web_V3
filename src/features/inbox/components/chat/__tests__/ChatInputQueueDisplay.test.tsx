/**
 * G1 — Testes dedicados para ChatInputQueueDisplay (P14/E64)
 * Cobre os 3 estados visuais (idle, sending, error) e o shimmer de loading.
 * Antes deste arquivo: zero cobertura unitária do componente real.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/ui/chat-shimmer', () => ({
  ChatShimmer: ({ className }: { className?: string }) => (
    <div data-testid="chat-shimmer" className={className} />
  ),
}));
vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { ChatInputQueueDisplay } from '../ChatInputQueueDisplay';
import type { QueueItem } from '../../../hooks/useMessageQueue';

const makeItem = (status: QueueItem['status'], id = 'q1'): QueueItem =>
  ({ id, status, attempts: [], createdAt: Date.now() }) as unknown as QueueItem;

describe('ChatInputQueueDisplay', () => {
  describe('renderiza null', () => {
    it('quando isRetryEnabled=false', () => {
      const { container } = render(
        <ChatInputQueueDisplay queue={[makeItem('pending')]} isRetryEnabled={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('quando fila está vazia', () => {
      const { container } = render(<ChatInputQueueDisplay queue={[]} isRetryEnabled={true} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('shimmer de loading', () => {
    it('exibe ChatShimmer quando isLoading=true', () => {
      render(
        <ChatInputQueueDisplay
          queue={[makeItem('pending')]}
          isRetryEnabled={true}
          isLoading={true}
        />
      );
      expect(screen.getByTestId('chat-shimmer')).toBeTruthy();
    });

    it('não exibe shimmer quando isLoading=false (default)', () => {
      render(<ChatInputQueueDisplay queue={[makeItem('pending')]} isRetryEnabled={true} />);
      expect(screen.queryByTestId('chat-shimmer')).toBeNull();
    });
  });

  describe('status idle', () => {
    it('exibe "Sincronização Ativa" com fila pendente', () => {
      render(<ChatInputQueueDisplay queue={[makeItem('pending')]} isRetryEnabled={true} />);
      expect(screen.getByText('Sincronização Ativa')).toBeTruthy();
    });

    it('exibe contagem correta — singular', () => {
      render(<ChatInputQueueDisplay queue={[makeItem('pending')]} isRetryEnabled={true} />);
      expect(screen.getByText(/1 mensagem pendente/)).toBeTruthy();
    });

    it('exibe contagem correta — plural', () => {
      render(
        <ChatInputQueueDisplay
          queue={[makeItem('pending', 'q1'), makeItem('pending', 'q2'), makeItem('pending', 'q3')]}
          isRetryEnabled={true}
        />
      );
      expect(screen.getByText(/3 mensagens pendentes/)).toBeTruthy();
    });
  });

  describe('status sending', () => {
    it('exibe ícone de loading (aria-label Sincronizando)', () => {
      render(<ChatInputQueueDisplay queue={[makeItem('sending')]} isRetryEnabled={true} />);
      expect(screen.getByLabelText('Sincronizando')).toBeTruthy();
    });
  });

  describe('status error', () => {
    it('exibe "Erro na fila" quando há item failed', () => {
      render(<ChatInputQueueDisplay queue={[makeItem('failed')]} isRetryEnabled={true} />);
      // Aparece duas vezes: no span de status e no badge
      expect(screen.getAllByText('Erro na fila').length).toBeGreaterThanOrEqual(1);
    });

    it('ícone de erro tem aria-label "Erro na fila"', () => {
      render(<ChatInputQueueDisplay queue={[makeItem('failed')]} isRetryEnabled={true} />);
      expect(screen.getByLabelText('Erro na fila')).toBeTruthy();
    });
  });

  describe('count > 99', () => {
    it('exibe contagem numérica correta quando fila é grande', () => {
      const bigQueue = Array.from({ length: 150 }, (_, i) => makeItem('pending', `q${i}`));
      render(<ChatInputQueueDisplay queue={bigQueue} isRetryEnabled={true} />);
      expect(screen.getByText(/150 mensagens pendentes/)).toBeTruthy();
    });
  });
});
