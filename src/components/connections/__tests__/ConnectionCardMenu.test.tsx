import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectionCardMenu } from '../ConnectionCardMenu';
import type { WhatsAppConnection } from '@/features/connections';

const connection: WhatsAppConnection = {
  id: 'conn-1',
  name: 'Suporte',
  phone_number: '+55 11 99999-0000',
  instance_id: 'instance-1',
  instance_name: 'suporte_123456',
  status: 'disconnected',
  qr_code: null,
  is_default: false,
  created_at: '2026-08-26T12:00:00.000Z',
  updated_at: '2026-08-26T12:00:00.000Z',
};

function setup(openWith: 'keyboard' | 'mouse' = 'keyboard') {
  const onDelete = vi.fn();
  render(
    <ConnectionCardMenu
      connection={connection}
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
  if (openWith === 'keyboard') {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
  } else {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  }

  return { onDelete, trigger };
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

  it('mantém tooltip acessível por hover e bloqueia click do mouse sem disparar exclusão', () => {
    const { onDelete } = setup('mouse');
    const deleteAction = screen.getByRole('menuitem', {
      name: 'Excluir conexão indisponível',
    });

    expect(
      screen.queryByText('A remoção completa da instância Evolution ainda não está habilitada.')
    ).not.toBeInTheDocument();

    fireEvent.pointerMove(deleteAction);

    expect(
      screen.getByText('A remoção completa da instância Evolution ainda não está habilitada.')
    ).toBeInTheDocument();

    fireEvent.click(deleteAction);

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
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

  it('fecha o tooltip ao dispensar o menu e o reabre limpo', async () => {
    const { trigger } = setup();
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'End' });

    const deleteAction = screen.getByRole('menuitem', {
      name: 'Excluir conexão indisponível',
    });
    fireEvent.focus(deleteAction);
    expect(
      screen.getByText('A remoção completa da instância Evolution ainda não está habilitada.')
    ).toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    expect(
      screen.queryByText('A remoção completa da instância Evolution ainda não está habilitada.')
    ).not.toBeInTheDocument();
  });
});
