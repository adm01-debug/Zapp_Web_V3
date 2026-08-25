/**
 * G3 — Testes dedicados para AudioTranscription (P22/E71)
 * Cobre os 4 estados: idle, loading, success (com copy), error (com retry).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/chat-shimmer', () => ({
  ChatShimmer: () => <div data-testid="chat-shimmer" />,
}));
vi.mock('@/lib/utils', () => ({ cn: (...a: unknown[]) => a.filter(Boolean).join(' ') }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, 'aria-label': al, ...p }: Record<string,unknown>) =>
    <button onClick={onClick as never} aria-label={al as string} {...p}>{children as React.ReactNode}</button>,
}));

import { AudioTranscription } from '../AudioTranscription';

describe('AudioTranscription', () => {
  describe('estado idle', () => {
    it('exibe botão "Transcrever" com aria-label correto', () => {
      render(<AudioTranscription status="idle" />);
      expect(screen.getByLabelText('Transcrever áudio')).toBeTruthy();
    });

    it('onTranscribe chamado ao clicar', () => {
      const onTranscribe = vi.fn();
      render(<AudioTranscription status="idle" onTranscribe={onTranscribe} />);
      fireEvent.click(screen.getByLabelText('Transcrever áudio'));
      expect(onTranscribe).toHaveBeenCalled();
    });
  });

  describe('estado loading', () => {
    it('exibe shimmer', () => {
      render(<AudioTranscription status="loading" />);
      expect(screen.getByTestId('chat-shimmer')).toBeTruthy();
    });

    it('exibe texto "Transcrevendo..."', () => {
      render(<AudioTranscription status="loading" />);
      expect(screen.getByText('Transcrevendo...')).toBeTruthy();
    });

    it('não exibe botão Transcrever', () => {
      render(<AudioTranscription status="loading" />);
      expect(screen.queryByLabelText('Transcrever áudio')).toBeNull();
    });
  });

  describe('estado success', () => {
    it('exibe o texto da transcrição', () => {
      render(<AudioTranscription status="success" transcription="Olá mundo" />);
      expect(screen.getByText('Olá mundo')).toBeTruthy();
    });

    it('exibe botão Copiar com aria-label', () => {
      render(<AudioTranscription status="success" transcription="texto" />);
      expect(screen.getByLabelText('Copiar transcrição')).toBeTruthy();
    });

    it('onCopy chamado com o texto correto', () => {
      const onCopy = vi.fn();
      render(<AudioTranscription status="success" transcription="copiado" onCopy={onCopy} />);
      fireEvent.click(screen.getByLabelText('Copiar transcrição'));
      expect(onCopy).toHaveBeenCalledWith('copiado');
    });

    it('não exibe nada de success quando transcription está vazia', () => {
      const { container } = render(<AudioTranscription status="success" />);
      // success sem transcription: não renderiza o bloco de texto/copy
      expect(container.querySelector('p')).toBeNull();
    });
  });

  describe('estado error', () => {
    it('exibe mensagem padrão quando sem erro específico', () => {
      render(<AudioTranscription status="error" />);
      expect(screen.getByText('Erro ao transcrever. Tente novamente.')).toBeTruthy();
    });

    it('exibe mensagem de erro customizada', () => {
      render(<AudioTranscription status="error" error="Serviço indisponível" />);
      expect(screen.getByText('Serviço indisponível')).toBeTruthy();
    });

    it('botão Tentar novamente chama onRetry', () => {
      const onRetry = vi.fn();
      render(<AudioTranscription status="error" onRetry={onRetry} />);
      fireEvent.click(screen.getByLabelText('Tentar novamente'));
      expect(onRetry).toHaveBeenCalled();
    });
  });
});
