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

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Opções da conexão' }), {
    button: 0,
    ctrlKey: false,
  });

  return { onDelete };
}

describe('<ConnectionCardMenu /> — exclusão indisponível', () => {
  it('comunica que a exclusão está indisponível sem prometer sucesso', () => {
    setup();

    expect(
      screen.getByRole('menuitem', { name: 'Excluir conexão indisponível' })
    ).toHaveAttribute('data-disabled');
    expect(
      screen.getByText(
        'Indisponível no momento: a exclusão ponta a ponta da instância Evolution ainda não está habilitada.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(
        'Indisponível: a exclusão ponta a ponta da instância Evolution ainda não está habilitada.'
      )
    ).toBeInTheDocument();
  });

  it('não dispara o callback de exclusão quando o item desabilitado é clicado', () => {
    const { onDelete } = setup();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir conexão indisponível' }));

    expect(onDelete).not.toHaveBeenCalled();
  });
});
