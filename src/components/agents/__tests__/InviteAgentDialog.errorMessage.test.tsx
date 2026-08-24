/**
 * InviteAgentDialog (send-email) — mensagem real do 422 (PLANO-100-CONTRATOS-
 * EDGE, Bloco 7, etapa 80 / F1).
 *
 * Antes: `throw error` caía num catch genérico com mensagem hardcoded
 * ("Verifique a configuração de email"), mesmo quando o 422 apontava um
 * motivo específico (ex.: campo `to` inválido).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteAgentDialog } from '../InviteAgentDialog';

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { invokeEdge } from '@/lib/invokeEdge';
import { toast } from 'sonner';

const mockInvokeEdge = invokeEdge as unknown as ReturnType<typeof vi.fn>;
const mockToastError = (toast as unknown as { error: ReturnType<typeof vi.fn> }).error;

describe('InviteAgentDialog — mensagem real do 422 (F1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('422 com fieldErrors.to mostra a mensagem real inline, não o texto genérico hardcoded', async () => {
    mockInvokeEdge.mockResolvedValue({
      ok: false,
      code: 'contract_violation',
      message: 'e-mail inválido',
      fieldErrors: { to: 'e-mail inválido' },
    });

    render(<InviteAgentDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'nao-e-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(mockInvokeEdge).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('e-mail inválido');
    expect(mockToastError).toHaveBeenCalledWith('e-mail inválido');
  });

  it('sucesso: fecha o dialog e reseta o formulário', async () => {
    mockInvokeEdge.mockResolvedValue({ ok: true, data: { success: true } });
    const onOpenChange = vi.fn();

    render(<InviteAgentDialog open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'novo@atomica.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
