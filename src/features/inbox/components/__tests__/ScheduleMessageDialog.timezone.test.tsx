import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

import {
  ScheduleMessageDialog,
  buildScheduledLocalDate,
} from '../ScheduleMessageDialog';

describe('ScheduleMessageDialog timezone behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildScheduledLocalDate keeps the typed local calendar date and time', () => {
    const scheduled = buildScheduledLocalDate('2026-08-27', '09:15');

    expect(scheduled.getFullYear()).toBe(2026);
    expect(scheduled.getMonth()).toBe(7);
    expect(scheduled.getDate()).toBe(27);
    expect(scheduled.getHours()).toBe(9);
    expect(scheduled.getMinutes()).toBe(15);
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
    const expectedPreview = format(
      expectedDate,
      "EEEE, dd 'de' MMMM 'às' HH:mm",
      { locale: ptBR }
    );

    expect(screen.getByText(expectedPreview)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));

    await waitFor(() => expect(onSchedule).toHaveBeenCalledTimes(1));
    const scheduledAt = onSchedule.mock.calls[0][1] as Date;
    expect(scheduledAt.getFullYear()).toBe(expectedDate.getFullYear());
    expect(scheduledAt.getMonth()).toBe(expectedDate.getMonth());
    expect(scheduledAt.getDate()).toBe(expectedDate.getDate());
    expect(scheduledAt.getHours()).toBe(expectedDate.getHours());
    expect(scheduledAt.getMinutes()).toBe(expectedDate.getMinutes());
  });
});
