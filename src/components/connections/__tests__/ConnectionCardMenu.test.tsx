import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionCardMenu } from '../ConnectionCardMenu';
import type { WhatsAppConnection } from '@/features/connections';

function makeConnection(over: Partial<WhatsAppConnection> = {}): WhatsAppConnection {
  return {
    id: 'conn-1',
    name: 'Suporte',
    phone_number: '+55 11 99999-0000',
    instance_id: 'instance-1',
    instance_name: 'suporte_123456',
    status: 'disconnected',
    created_at: '2026-08-26T12:00:00.000Z',
    updated_at: '2026-08-26T12:00:00.000Z',
    ...over,
  };
}

function setup() {
  const onDelete = vi.fn();
  render(
    <ConnectionCardMenu
      connection={makeConnection()}
      recheckingHealth={false}
      evoName="suporte_123456"
      isOfficial={false}
      syncingHistory={null}
      hasSetApiType
      onRecheckNow={vi.fn()}
      onShowQrCode={vi.fn()}
      onSetDefault={vi.fn()}
      onBusinessHours={vi.fn()}
      onQueues={vi.fn()}
      onSettings={vi.fn()}
      onIntegrations={vi.fn()}
      onToggleApiType={vi.fn()}
      onOpenOfficialConfig={vi.fn()}
      onOpenAuditLog={vi.fn()}
      onCopyId={vi.fn()}
      onSyncHistory={vi.fn()}
      onDelete={onDelete}
    />
  );

  const trigger = screen.getByRole('button', { name: 'Opções da conexão' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });

  return { onDelete };
}

describe('<ConnectionCardMenu /> — exclusão indisponível', () => {
  it('mantém a ação alcançável por teclado e comunica o motivo sem prometer sucesso', () => {
    setup();

    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'End' });

    const deleteAction = screen.getByRole('menuitem', {
      name: 'Excluir conexão indisponível',
    });
    expect(deleteAction).toHaveFocus();
    expect(deleteAction).toHaveAttribute('aria-disabled', 'true');
    expect(deleteAction).toHaveAttribute(
      'aria-describedby',
      'connection-delete-unavailable-reason'
    );
    expect(
      screen.getByText(
        'Indisponível no momento: a exclusão ponta a ponta da instância Evolution ainda não está habilitada.'
      )
    ).toBeInTheDocument();

    fireEvent.focus(deleteAction);

    expect(
      screen.getByText('A remoção completa da instância Evolution ainda não está habilitada.')
    ).toBeInTheDocument();
  });

  it('bloqueia Enter e Space sem disparar o callback de exclusão', () => {
    const { onDelete } = setup();
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'End' });
    const deleteAction = screen.getByRole('menuitem', {
      name: 'Excluir conexão indisponível',
    });

    fireEvent.keyDown(deleteAction, { key: 'Enter' });
    fireEvent.keyDown(deleteAction, { key: ' ' });

    expect(onDelete).not.toHaveBeenCalled();
  });
});
