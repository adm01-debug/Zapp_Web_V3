import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TransferDialog } from '../TransferDialog';
import type { TransferConversationResult } from '../../hooks/useTransferConversation';

const toastSuccess = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    warning: toastWarning,
    error: toastError,
  },
}));

vi.mock('@/features/admin', () => ({
  useAgents: () => ({
    agents: [
      {
        id: 'agent-1',
        name: 'Ana',
        status: 'online',
        avatar_url: null,
        activeChats: 2,
        max_chats: 5,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useQueues', () => ({
  useQueues: () => ({
    queues: [],
    loading: false,
  }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe('TransferDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDialog = (
    onTransfer: () => Promise<TransferConversationResult | void> | TransferConversationResult | void
  ) => {
    const onOpenChange = vi.fn();
    const view = render(
      <TransferDialog open onOpenChange={onOpenChange} onTransfer={onTransfer} />
    );

    fireEvent.click(screen.getByText('Ana'));

    return {
      onOpenChange,
      setOpen: (open: boolean) =>
        view.rerender(
          <TransferDialog open={open} onOpenChange={onOpenChange} onTransfer={onTransfer} />
        ),
    };
  };

  it('não expõe transferência entre conexões sem contrato de backend', () => {
    renderDialog(vi.fn());

    expect(screen.queryByText('Conexão')).not.toBeInTheDocument();
    expect(screen.queryByText('Outro WhatsApp')).not.toBeInTheDocument();
  });

  it('aguarda a promise de transferência antes de fechar o diálogo', async () => {
    let resolveTransfer!: (value: TransferConversationResult) => void;
    const onTransfer = vi.fn(
      () =>
        new Promise<TransferConversationResult>((resolve) => {
          resolveTransfer = resolve;
        })
    );

    const { onOpenChange } = renderDialog(onTransfer);
    fireEvent.click(screen.getByRole('button', { name: /Transferir/i }));
    fireEvent.click(screen.getByRole('button', { name: /Transferindo/i }));

    expect(onTransfer).toHaveBeenCalledTimes(1);
    expect(onTransfer).toHaveBeenCalledWith('agent', 'agent-1', undefined);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

    await act(async () => {
      resolveTransfer({
        status: 'success',
        title: 'Chat transferido!',
        description: 'O chat foi transferido para outro atendente.',
      });
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Chat transferido!', {
      description: 'O chat foi transferido para outro atendente.',
    });
  });

  it('ignora a conclusão de uma tentativa obsoleta após fechamento externo', async () => {
    let resolveTransfer!: (value: TransferConversationResult) => void;
    const onTransfer = vi.fn(
      () =>
        new Promise<TransferConversationResult>((resolve) => {
          resolveTransfer = resolve;
        })
    );

    const { onOpenChange, setOpen } = renderDialog(onTransfer);
    fireEvent.click(screen.getByRole('button', { name: /Transferir/i }));

    setOpen(false);
    setOpen(true);

    await act(async () => {
      resolveTransfer({
        status: 'success',
        title: 'Chat transferido!',
        description: 'O chat foi transferido para outro atendente.',
      });
    });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('fecha com warning quando a transferência foi parcial, sem toast de sucesso pleno', async () => {
    const onTransfer = vi.fn().mockResolvedValue({
      status: 'partial',
      title: 'Transferência parcial',
      description: 'O chat foi transferido, mas a trilha de auditoria ficou incompleta.',
    } satisfies TransferConversationResult);

    const { onOpenChange } = renderDialog(onTransfer);
    fireEvent.click(screen.getByRole('button', { name: /Transferir/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toastWarning).toHaveBeenCalledWith('Transferência parcial', {
      description: 'O chat foi transferido, mas a trilha de auditoria ficou incompleta.',
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('fecha sem ler status quando o callback resolve sem payload detalhado', async () => {
    const onTransfer = vi.fn().mockResolvedValue(undefined);

    const { onOpenChange } = renderDialog(onTransfer);
    fireEvent.click(screen.getByRole('button', { name: /Transferir/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('mantém o diálogo aberto quando a transferência falha antes da atualização principal', async () => {
    const onTransfer = vi.fn().mockResolvedValue({
      status: 'error',
      title: 'Erro na transferência',
      description: 'Não foi possível transferir o chat. Tente novamente.',
    } satisfies TransferConversationResult);

    const { onOpenChange } = renderDialog(onTransfer);
    fireEvent.click(screen.getByRole('button', { name: /Transferir/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Erro na transferência', {
        description: 'Não foi possível transferir o chat. Tente novamente.',
      });
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
