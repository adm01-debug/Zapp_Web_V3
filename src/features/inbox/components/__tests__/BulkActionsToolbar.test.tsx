import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BulkActionsToolbar } from '../BulkActionsToolbar';

vi.mock('@/hooks/useDensity', () => ({
  useDensity: () => ({ density: 'comfortable' }),
}));

describe('BulkActionsToolbar', () => {
  it('mantém a transferência em massa indisponível enquanto não há trilha auditável', () => {
    render(
      <TooltipProvider>
        <BulkActionsToolbar
          selectedCount={2}
          onMarkAsRead={vi.fn()}
          onArchive={vi.fn()}
          onClearSelection={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(
      screen.getByRole('button', { name: 'Transferência em massa indisponível' })
    ).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
