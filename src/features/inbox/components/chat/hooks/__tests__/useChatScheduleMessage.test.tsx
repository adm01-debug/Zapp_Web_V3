import type { ComponentProps } from 'react';
import { describe, it, expect, expectTypeOf, vi, beforeEach } from 'vitest';
import { render, renderHook, act, fireEvent, screen, waitFor } from '@testing-library/react';

const mockUpload = vi.hoisted(() => vi.fn());
const mockCreateSignedUrl = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
        remove: mockRemove,
      }),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: mockToast,
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { useChatScheduleMessage } from '@/features/inbox/components/chat/hooks/useChatScheduleMessage';
import { ScheduleMessageDialog } from '@/features/inbox/components/ScheduleMessageDialog';

const mockScheduleMessage =
  vi.fn<
    (args: {
      contactId: string;
      content: string;
      scheduledAt: Date;
      messageType: string;
      mediaUrl?: string;
    }) => Promise<unknown>
  >();

type ChatDialogsScheduleHandler = ComponentProps<
  typeof import('@/features/inbox/components/chat/ChatDialogs').ChatDialogs
>['onScheduleMessage'];

function renderScheduleHook() {
  const onDone = vi.fn();
  const utils = renderHook(() =>
    useChatScheduleMessage({
      contactId: 'c1',
      scheduleMessage: mockScheduleMessage,
      onDone,
    })
  );
  return { ...utils, onDone };
}

const future = () => new Date(Date.now() + 86_400_000);

function tomorrowDateInput(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderDialogIntegration(scheduleImpl = mockScheduleMessage) {
  const onOpenChange = vi.fn();

  function Harness() {
    const onSchedule = useChatScheduleMessage({
      contactId: 'c1',
      scheduleMessage: scheduleImpl,
      onDone: () => onOpenChange(false),
    });

    return <ScheduleMessageDialog open onOpenChange={onOpenChange} onSchedule={onSchedule} />;
  }

  render(<Harness />);
  return { onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpload.mockReset();
  mockCreateSignedUrl.mockReset();
  mockRemove.mockReset();
  mockScheduleMessage.mockReset();
  mockScheduleMessage.mockResolvedValue({ id: 'sm1' });
  mockRemove.mockResolvedValue({ error: null });
});

describe('useChatScheduleMessage (CAMPANHAS-09)', () => {
  it('schedules text message with exact args and calls onDone once', async () => {
    const { result, onDone } = renderScheduleHook();

    expectTypeOf(result.current).toEqualTypeOf<ChatDialogsScheduleHandler>();

    await act(async () => {
      await result.current('Olá', future());
    });

    expect(mockScheduleMessage).toHaveBeenCalledTimes(1);
    expect(mockScheduleMessage).toHaveBeenCalledWith({
      contactId: 'c1',
      content: 'Olá',
      scheduledAt: expect.any(Date),
      messageType: 'text',
      mediaUrl: undefined,
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('toasts REAL RLS error on 403 and does NOT call onDone (sem silêncio)', async () => {
    mockScheduleMessage.mockRejectedValue({
      code: '42501',
      message: 'new row violates row-level security policy',
    });
    const { result, onDone } = renderScheduleHook();

    await act(async () => {
      await result.current('Olá', future());
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao agendar mensagem',
        variant: 'destructive',
        description: expect.stringContaining('Acesso negado'),
      })
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('toasts generic error on non-RLS failure and does NOT call onDone', async () => {
    mockScheduleMessage.mockRejectedValue(new Error('network down'));
    const { result, onDone } = renderScheduleHook();

    await act(async () => {
      await result.current('Olá', future());
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao agendar mensagem',
        variant: 'destructive',
        description: 'Tente novamente.',
      })
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('does not schedule when attachment upload fails (toast de upload)', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'bucket denied' } });
    const { result, onDone } = renderScheduleHook();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await act(async () => {
      await result.current('Olá', future(), file);
    });

    expect(mockScheduleMessage).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro no upload', variant: 'destructive' })
    );
  });

  it('uploads attachment and schedules as media type with signed URL', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed/url' },
      error: null,
    });
    const { result, onDone } = renderScheduleHook();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await act(async () => {
      await result.current('Legenda', future(), file);
    });

    expect(mockScheduleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'image',
        mediaUrl: 'https://signed/url',
      })
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when signed URL generation returns error after successful upload', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'signing denied' },
    });
    const { result, onDone } = renderScheduleHook();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await act(async () => {
      await result.current('Legenda', future(), file);
    });

    expect(mockScheduleMessage).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith([expect.stringMatching(/^scheduled_/)]);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro no upload',
        description: expect.stringContaining('signing denied'),
        variant: 'destructive',
      })
    );
  });

  it('does not schedule when signed URL payload is missing the URL', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: {}, error: null });
    const { result, onDone } = renderScheduleHook();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await act(async () => {
      await result.current('Legenda', future(), file);
    });

    expect(mockScheduleMessage).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith([expect.stringMatching(/^scheduled_/)]);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro no upload',
        description: expect.stringContaining('Falha ao gerar link do anexo'),
        variant: 'destructive',
      })
    );
  });

  it('keeps stable identity between renders (useCallback)', () => {
    const { result, rerender } = renderScheduleHook();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('removes an uploaded attachment when persisting the schedule fails', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed/url' },
      error: null,
    });
    mockScheduleMessage.mockRejectedValue(new Error('database unavailable'));
    const { result, onDone } = renderScheduleHook();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    await act(async () => {
      await result.current('Legenda', future(), file);
    });

    expect(onDone).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith([expect.stringMatching(/^scheduled_/)]);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao agendar mensagem',
        variant: 'destructive',
      })
    );
  });
});

describe('useChatScheduleMessage — E39: prazo máximo de agendamento (signed URL 7d)', () => {
  it('E39.8 RED: agendamento com mídia para mais de 7 dias cria URL inválida — deve ser rejeitado', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed/url' },
      error: null,
    });
    const { result, onDone } = renderScheduleHook();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    // 8 dias à frente > TTL da signed URL (604800s = 7 dias) → URL expira
    // antes do envio agendado. O hook deve REJEITAR com erro claro.
    const farFuture = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

    await act(async () => {
      await result.current('Legenda', farFuture, file);
    });

    // RED (bug documentado): hoje agenda e cria URL quebrada.
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockScheduleMessage).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('7 dias'),
        variant: 'destructive',
      })
    );
  });

  it('E39.9 pin: agendamento com mídia DENTRO de 7 dias continua funcionando', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed/ok' },
      error: null,
    });
    const { result, onDone } = renderScheduleHook();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const within7d = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

    await act(async () => {
      await result.current('Legenda', within7d, file);
    });

    expect(mockScheduleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'image', mediaUrl: 'https://signed/ok' })
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('useChatScheduleMessage + ScheduleMessageDialog integration', () => {
  it('keeps the dialog open and does not emit a success toast when the hook reports failure', async () => {
    mockScheduleMessage.mockRejectedValue(new Error('network down'));
    const { onOpenChange } = renderDialogIntegration();

    fireEvent.change(screen.getByLabelText('Mensagem'), {
      target: { value: 'Olá' },
    });
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: tomorrowDateInput() },
    });
    fireEvent.change(screen.getByLabelText('Hora'), {
      target: { value: '09:15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Erro ao agendar mensagem',
          variant: 'destructive',
        })
      );
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mensagem agendada!' })
    );
  });
});
