import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildScheduledLocalDate } from '../ScheduleMessageDialog.utils';

const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

import {
  ScheduleMessageDialog,
} from '../ScheduleMessageDialog';

describe('ScheduleMessageDialog timezone behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildScheduledLocalDate keeps the typed local calendar date and time', () => {
    const scheduled = buildScheduledLocalDate('2026-08-27', '09:15');

    expect(scheduled).not.toBeNull();
    expect((scheduled as Date).getFullYear()).toBe(2026);
    expect((scheduled as Date).getMonth()).toBe(7);
    expect((scheduled as Date).getDate()).toBe(27);
    expect((scheduled as Date).getHours()).toBe(9);
    expect((scheduled as Date).getMinutes()).toBe(15);
  });

  it('rejects invalid normalized local datetime values instead of silently shifting them', () => {
    expect(buildScheduledLocalDate('2026-02-31', '09:15')).toBeNull();
    expect(buildScheduledLocalDate('2026-08-27', '24:15')).toBeNull();
  });

  it('uses the same local datetime for preview and submit', async () => {
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleMessageDialog open onOpenChange={vi.fn()} onSchedule={onSchedule} />
    );

    fireEvent.change(screen.getByLabelText('Mensagem'), {
      target: { value: 'Enviar proposta' },
    });
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-08-27' },
    });
    fireEvent.change(screen.getByLabelText('Hora'), {
      target: { value: '09:15' },
    });

    const expectedDate = buildScheduledLocalDate('2026-08-27', '09:15');
    expect(expectedDate).not.toBeNull();
    const expectedPreview = format(
      expectedDate as Date,
      "EEEE, dd 'de' MMMM 'às' HH:mm",
      { locale: ptBR }
    );

    expect(screen.getByText(expectedPreview)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));

    await waitFor(() => expect(onSchedule).toHaveBeenCalledTimes(1));
    const scheduledAt = onSchedule.mock.calls[0][1] as Date;
    expect(scheduledAt.getFullYear()).toBe((expectedDate as Date).getFullYear());
    expect(scheduledAt.getMonth()).toBe((expectedDate as Date).getMonth());
    expect(scheduledAt.getDate()).toBe((expectedDate as Date).getDate());
    expect(scheduledAt.getHours()).toBe((expectedDate as Date).getHours());
    expect(scheduledAt.getMinutes()).toBe((expectedDate as Date).getMinutes());
  });

  it('keeps the dialog open and skips the success toast when onSchedule returns false', async () => {
    const onOpenChange = vi.fn();
    const onSchedule = vi.fn().mockResolvedValue(false);
    render(
      <ScheduleMessageDialog open onOpenChange={onOpenChange} onSchedule={onSchedule} />
    );

    fireEvent.change(screen.getByLabelText('Mensagem'), {
      target: { value: 'Enviar proposta' },
    });
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-08-27' },
    });
    fireEvent.change(screen.getByLabelText('Hora'), {
      target: { value: '09:15' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));

    await waitFor(() => expect(onSchedule).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mensagem agendada!' })
    );
  });
});
