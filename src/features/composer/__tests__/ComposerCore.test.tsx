import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComposerCore } from '../ComposerCore';

const BASE_PROPS = {
  value: '',
  onChange: vi.fn(),
  onSend: vi.fn(),
  onRecordToggle: vi.fn(),
};

describe('ComposerCore', () => {
  it('renderiza o textarea', () => {
    render(<ComposerCore {...BASE_PROPS} />);
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('placeholder padrão do COPY', () => {
    render(<ComposerCore {...BASE_PROPS} />);
    expect(screen.getByPlaceholderText('Escreva sua mensagem...')).toBeDefined();
  });

  it('placeholder customizado', () => {
    render(<ComposerCore {...BASE_PROPS} placeholder="Digite aqui..." />);
    expect(screen.getByPlaceholderText('Digite aqui...')).toBeDefined();
  });

  it('role=form com aria-label', () => {
    render(<ComposerCore {...BASE_PROPS} />);
    const form = screen.getByRole('form');
    expect(form.getAttribute('aria-label')).toBe('Área de composição de mensagem');
  });

  it('botão Send renderiza com aria-label correto (idle)', () => {
    render(<ComposerCore {...BASE_PROPS} />);
    const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });
    expect(sendBtn).toBeDefined();
  });

  it('botão Send com aria-label de enviando quando isSending=true', () => {
    render(<ComposerCore {...BASE_PROPS} isSending />);
    expect(screen.getByRole('button', { name: 'Enviando mensagem...' })).toBeDefined();
  });

  it('botão Mic renderiza com aria-label correto (idle)', () => {
    render(<ComposerCore {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeDefined();
  });

  it('botão Mic com aria-label de parar quando isMicActive=true', () => {
    render(<ComposerCore {...BASE_PROPS} isMicActive />);
    expect(screen.getByRole('button', { name: 'Parar gravação' })).toBeDefined();
  });

  it('botão Mic tem aria-pressed=true quando isMicActive', () => {
    render(<ComposerCore {...BASE_PROPS} isMicActive />);
    const mic = screen.getByRole('button', { name: 'Parar gravação' });
    expect(mic.getAttribute('aria-pressed')).toBe('true');
  });

  it('chama onSend ao clicar Send', () => {
    const onSend = vi.fn();
    render(<ComposerCore {...BASE_PROPS} onSend={onSend} canSend />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect(onSend).toHaveBeenCalled();
  });

  it('chama onRecordToggle ao clicar Mic', () => {
    const onRecordToggle = vi.fn();
    render(<ComposerCore {...BASE_PROPS} onRecordToggle={onRecordToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
    expect(onRecordToggle).toHaveBeenCalled();
  });

  it('não renderiza botão + quando slot plusMenuContent ausente', () => {
    render(<ComposerCore {...BASE_PROPS} />);
    expect(screen.queryByRole('button', { name: 'Mais opções de mensagem' })).toBeNull();
  });

  it('renderiza botão + quando slot plusMenuContent presente', () => {
    render(<ComposerCore {...BASE_PROPS} slots={{ plusMenuContent: <div>menu</div> }} />);
    expect(screen.getByRole('button', { name: 'Mais opções de mensagem' })).toBeDefined();
  });

  it('modo isWhisper aplica classe de borda âmbar', () => {
    const { container } = render(<ComposerCore {...BASE_PROPS} isWhisper />);
    const form = container.querySelector('[role="form"]');
    expect(form?.className).toContain('border-warning');
  });

  it('textarea desabilitado quando isSending=true', () => {
    render(<ComposerCore {...BASE_PROPS} isSending />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it('slot footer renderiza', () => {
    render(<ComposerCore {...BASE_PROPS} slots={{ footer: <div data-testid="footer">F</div> }} />);
    expect(screen.getByTestId('footer')).toBeDefined();
  });

  it('slot afterMic renderiza', () => {
    render(<ComposerCore {...BASE_PROPS} slots={{ afterMic: <div data-testid="after">A</div> }} />);
    expect(screen.getByTestId('after')).toBeDefined();
  });
});
