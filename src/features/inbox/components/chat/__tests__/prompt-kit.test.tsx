/**
 * G3 — Testes dedicados para PromptInput, PromptSuggestion, PromptActions (P19/E68)
 * Componentes do prompt-kit sem shadcn registry: textarea AI, chips e barra de ações.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/utils', () => ({ cn: (...a: unknown[]) => a.filter(Boolean).join(' ') }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, 'aria-label': al }: Record<string, unknown>) => (
    <button onClick={onClick as never} disabled={!!disabled} aria-label={al as string}>
      {children as React.ReactNode}
    </button>
  ),
}));

import { PromptInput } from '@/components/ui/prompt-kit/PromptInput';
import { PromptSuggestion } from '@/components/ui/prompt-kit/PromptSuggestion';
import { PromptActions } from '@/components/ui/prompt-kit/PromptActions';

describe('PromptInput (P19)', () => {
  it('renderiza um textarea', () => {
    render(<PromptInput />);
    expect(document.querySelector('textarea')).toBeTruthy();
  });

  it('usa primeiro placeholder do array quando placeholder não informado', () => {
    render(<PromptInput placeholders={['O que você quer saber?', 'Pergunte algo...']} />);
    const ta = document.querySelector('textarea');
    expect(ta?.getAttribute('placeholder')).toBe('O que você quer saber?');
  });

  it('placeholder prop sobrepõe placeholders array', () => {
    render(<PromptInput placeholder="Direto" placeholders={['Ignorar']} />);
    expect(document.querySelector('textarea')?.getAttribute('placeholder')).toBe('Direto');
  });

  it('placeholder padrão quando nenhum fornecido', () => {
    render(<PromptInput />);
    expect(document.querySelector('textarea')?.getAttribute('placeholder')).toBe(
      'Digite sua pergunta...'
    );
  });

  it('isLoading=true → disabled e opaco', () => {
    render(<PromptInput isLoading={true} />);
    const ta = document.querySelector('textarea');
    expect(ta?.disabled).toBe(true);
    expect(ta?.className).toContain('opacity-60');
  });

  it('aceita ref forwarded', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<PromptInput ref={ref} />);
    expect(ref.current).toBeTruthy();
    expect(ref.current?.tagName).toBe('TEXTAREA');
  });
});

describe('PromptSuggestion (P19)', () => {
  it('renderiza o label', () => {
    render(<PromptSuggestion label="Resumir texto" />);
    expect(screen.getByText('Resumir texto')).toBeTruthy();
  });

  it('chama onClick ao clicar', () => {
    const onClick = vi.fn();
    render(<PromptSuggestion label="Traduzir" onClick={onClick} />);
    fireEvent.click(screen.getByText('Traduzir'));
    expect(onClick).toHaveBeenCalled();
  });

  it('é um <button> do tipo button', () => {
    render(<PromptSuggestion label="Analisar" />);
    const btn = screen.getByText('Analisar').closest('button');
    expect(btn?.getAttribute('type')).toBe('button');
  });

  it('aceita className adicional', () => {
    render(<PromptSuggestion label="X" className="extra-class" />);
    expect(screen.getByText('X').closest('button')?.className).toContain('extra-class');
  });
});

describe('PromptActions (P19)', () => {
  it('botão Enviar sempre presente', () => {
    render(<PromptActions />);
    expect(screen.getByLabelText('Enviar')).toBeTruthy();
  });

  it('onSend chamado ao clicar Enviar', () => {
    const onSend = vi.fn();
    render(<PromptActions onSend={onSend} canSend={true} />);
    fireEvent.click(screen.getByLabelText('Enviar'));
    expect(onSend).toHaveBeenCalled();
  });

  it('Enviar desabilitado quando canSend=false', () => {
    render(<PromptActions canSend={false} />);
    expect(screen.getByLabelText('Enviar')).toBeDisabled();
  });

  it('Enviar desabilitado quando isLoading=true', () => {
    render(<PromptActions isLoading={true} canSend={true} />);
    expect(screen.getByLabelText('Enviar')).toBeDisabled();
  });

  it('botão Limpar não renderiza quando onClear não fornecido', () => {
    render(<PromptActions />);
    expect(screen.queryByLabelText('Limpar')).toBeNull();
  });

  it('botão Limpar aparece e chama onClear', () => {
    const onClear = vi.fn();
    render(<PromptActions onClear={onClear} />);
    const clearBtn = screen.getByLabelText('Limpar');
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalled();
  });

  it('Limpar desabilitado quando isLoading=true', () => {
    render(<PromptActions onClear={vi.fn()} isLoading={true} />);
    expect(screen.getByLabelText('Limpar')).toBeDisabled();
  });
});
