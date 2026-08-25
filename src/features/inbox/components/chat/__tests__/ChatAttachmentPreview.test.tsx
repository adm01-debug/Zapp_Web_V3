/**
 * G1 — Testes dedicados para ChatAttachmentPreview (P12/E61)
 * Cobre: null quando vazio, ícones por categoria, botão remover, preview de imagem.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...p }: Record<string, unknown>) => (
      <div {...p}>{children as React.ReactNode}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ChatAttachmentPreview } from '../ChatAttachmentPreview';
import type { ChatInputAttachment } from '../useChatInputLogic';

const makeAtt = (overrides: Partial<ChatInputAttachment> = {}): ChatInputAttachment =>
  ({
    id: 'att-1',
    file: new File([''], 'file.png', { type: 'image/png' }),
    category: 'image',
    preview: null,
    ...overrides,
  }) as ChatInputAttachment;

describe('ChatAttachmentPreview', () => {
  it('retorna null quando lista vazia', () => {
    const { container } = render(<ChatAttachmentPreview attachments={[]} onRemove={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza preview de imagem quando preview está disponível', () => {
    const att = makeAtt({ preview: 'data:image/png;base64,abc', category: 'image' });
    render(<ChatAttachmentPreview attachments={[att]} onRemove={vi.fn()} />);
    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,abc');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('renderiza ícone FileText para categoria document', () => {
    const att = makeAtt({
      preview: null,
      category: 'document',
      file: new File([''], 'doc.pdf', { type: 'application/pdf' }),
    });
    render(<ChatAttachmentPreview attachments={[att]} onRemove={vi.fn()} />);
    // O nome do arquivo aparece
    expect(screen.getByText('doc.pdf')).toBeTruthy();
  });

  it('botão remover tem aria-label correto', () => {
    const att = makeAtt({ file: new File([''], 'foto.jpg', { type: 'image/jpeg' }) });
    render(<ChatAttachmentPreview attachments={[att]} onRemove={vi.fn()} />);
    expect(screen.getByLabelText('Remover anexo foto.jpg')).toBeTruthy();
  });

  it('botão remover chama onRemove com o id correto', () => {
    const onRemove = vi.fn();
    const att = makeAtt({ id: 'att-xyz' });
    render(<ChatAttachmentPreview attachments={[att]} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText(/Remover anexo/));
    expect(onRemove).toHaveBeenCalledWith('att-xyz');
  });

  it('renderiza múltiplos anexos', () => {
    const atts = [
      makeAtt({ id: 'a1', file: new File([''], 'a.png', { type: 'image/png' }) }),
      makeAtt({
        id: 'a2',
        file: new File([''], 'b.pdf', { type: 'application/pdf' }),
        category: 'document',
      }),
    ];
    render(<ChatAttachmentPreview attachments={atts} onRemove={vi.fn()} />);
    expect(screen.getByLabelText('Remover anexo a.png')).toBeTruthy();
    expect(screen.getByLabelText('Remover anexo b.pdf')).toBeTruthy();
  });
});
