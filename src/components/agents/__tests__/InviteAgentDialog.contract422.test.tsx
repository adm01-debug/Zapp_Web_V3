/**
 * InviteAgentDialog — consumo do 422 canônico (Bloco 7, etapa 80).
 *
 * O diálogo envia convites via EF `send-email` (contrato send-email@v1:
 * `to` aceita e-mail ou lista; campos obrigatórios sem accountId).
 * Antes da migração pra `invokeEdge`, o `catch {}` descartava o corpo do
 * erro — qualquer 422 do gate (ex.: details[{path:'to'}] para e-mail
 * inválido) virava o genérico "Erro ao enviar convite...".
 *
 * Eixos:
 *   1. 422 VALIDATION_ERROR com details[{path:'to'}] → toast.error com a
 *      mensagem do contrato; diálogo PERMANECE aberto (onOpenChange não
 *      chamado com false) e toast.success não disparado.
 *   2. Erro de domínio ({error: string}) → mensagem honesta no toast.
 *   3. Sucesso → toast.success + limpa formulário + fecha diálogo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invokeMock = vi.hoisted(() => vi.fn());
const onOpenChange = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { InviteAgentDialog } from '../InviteAgentDialog';
import { toast } from 'sonner';

const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

/** Erro no shape supabase-js v2: FunctionsHttpError carrega a Response em
 * `.context`; `json()` devolve o corpo HTTP. */
function httpError(body: unknown, status = 422) {
  return { context: { status, json: vi.fn().mockResolvedValue(body) } };
}

function renderDialog() {
  render(<InviteAgentDialog open={true} onOpenChange={onOpenChange} />);
}

describe('InviteAgentDialog — 422 canônico (etapa 80)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('422 com details[to] → mensagem do contrato no toast; diálogo segue aberto, sem sucesso', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Corpo rejeitado pelo contrato send-email@v1',
        details: [{ path: 'to', message: 'e-mail inválido' }],
      }),
    });

    renderDialog();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'email-invalido' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('e-mail inválido');
    });
    expect(mockToast.success).not.toHaveBeenCalled();
    // erro não fecha o diálogo — usuário corrige e reenvia
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('erro de domínio fora do envelope canônico → mensagem honesta do servidor no toast', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError({ error: 'Resend não configurado neste ambiente' }, 500),
    });

    renderDialog();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'agente@empresa.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Resend não configurado neste ambiente');
    });
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('sucesso → toast.success + fecha diálogo (sem regressão)', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });

    renderDialog();
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'ana@empresa.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Convite enviado para ana@empresa.com!');
    });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
