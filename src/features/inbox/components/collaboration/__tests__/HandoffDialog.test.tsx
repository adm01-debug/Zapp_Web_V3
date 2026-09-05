/**
 * Regressão — HandoffDialog deve distinguir sucesso total, sucesso parcial
 * (nota não salva) e falha real (nada foi commitado), em vez de sempre
 * mostrar "transferido com sucesso" assim que onHandoff resolve.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HandoffDialog } from '../HandoffDialog';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

const AGENTS = [{ id: 'agent-1', name: 'Fulano', avatar_url: null }];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: AGENTS, error: null }),
      }),
    }),
  },
}));

function renderDialog(
  onHandoff: (agentId: string, comment: string) => Promise<{ noteSaved: boolean }>
) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <HandoffDialog open onOpenChange={vi.fn()} contactId="c1" onHandoff={onHandoff} />
    </QueryClientProvider>
  );
}

async function selectAgentAndSubmit() {
  const agentButton = await screen.findByText('Fulano');
  fireEvent.click(agentButton);
  fireEvent.click(screen.getByRole('button', { name: /Transferir/ }));
}

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  toastMock.warning.mockClear();
});

describe('HandoffDialog — toast por resultado (regressão de falso sucesso)', () => {
  it('sucesso total (noteSaved=true): toast.success', async () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: true });
    renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Conversa transferida com sucesso!')
    );
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('sucesso parcial (noteSaved=false): toast.warning, não toast.success', async () => {
    const onHandoff = vi.fn().mockResolvedValue({ noteSaved: false });
    renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Conversa transferida, mas a nota não pôde ser salva.'
      )
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('onHandoff rejeita (RLS/zero-row/ID inválido): toast.error, nunca toast.success', async () => {
    const onHandoff = vi.fn().mockRejectedValue(new Error('permission denied'));
    renderDialog(onHandoff);

    await selectAgentAndSubmit();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Erro ao transferir conversa')
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.warning).not.toHaveBeenCalled();
  });
});
