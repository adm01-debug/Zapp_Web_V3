import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mockUseEmail = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useEmailManagement', () => ({
  useEmail: () => mockUseEmail(),
}));

vi.mock('../GmailLabelSidebar', () => ({
  EmailLabelSidebar: () => <div data-testid="label-sidebar" />,
}));

vi.mock('../GmailAccountSelector', () => ({
  EmailAccountSelector: () => <div data-testid="account-selector" />,
}));

import { EmailInboxView } from '../GmailInboxView';

describe('GmailInboxView keyboard interactions', () => {
  const thread = {
    id: 'thread-1',
    unread_count: 2,
    subject: 'Assunto Importante',
    from_name: 'Maria',
    from_email: 'maria@example.com',
    snippet: 'Mensagem de teste',
    last_message_at: '2026-08-26T12:00:00.000Z',
    sla_status: null,
    is_starred: false,
  };

  const markAsRead = vi.fn();
  const starThread = vi.fn();
  const archiveThread = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEmail.mockReturnValue({
      accounts: [{ id: 'acc-1', email: 'maria@example.com' }],
      tokenStatus: [],
      threads: [thread],
      activeAccountId: 'acc-1',
      activeAccount: null,
      activeLabel: 'INBOX',
      isSyncing: false,
      isLoading: false,
      error: null,
      unreadCount: 2,
      slaBreachedCount: 0,
      hasTokenWarning: false,
      hasWatchWarning: false,
      setActiveAccountId: vi.fn(),
      setActiveLabel: vi.fn(),
      startOAuth: vi.fn(),
      disconnect: vi.fn(),
      syncNow: vi.fn(),
      markAsRead,
      starThread,
      archiveThread,
    });
  });

  function getThreadButton(): HTMLElement {
    return screen.getByText('Assunto Importante').closest('[role="button"]') as HTMLElement;
  }

  it('selects the thread with Enter', () => {
    const onSelectThread = vi.fn();
    render(<EmailInboxView onSelectThread={onSelectThread} />);

    fireEvent.keyDown(getThreadButton(), { key: 'Enter' });

    expect(onSelectThread).toHaveBeenCalledWith(thread);
    expect(markAsRead).toHaveBeenCalledWith('thread-1', true);
  });

  it('selects the thread with Space without relying on mouse click', () => {
    const onSelectThread = vi.fn();
    render(<EmailInboxView onSelectThread={onSelectThread} />);

    fireEvent.keyDown(getThreadButton(), { key: ' ' });

    expect(onSelectThread).toHaveBeenCalledWith(thread);
    expect(markAsRead).toHaveBeenCalledWith('thread-1', true);
  });

  it('ignores Enter from the favorite button so the row is not selected or marked as read', () => {
    const onSelectThread = vi.fn();
    render(<EmailInboxView onSelectThread={onSelectThread} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Adicionar favorito' }), {
      key: 'Enter',
    });

    expect(onSelectThread).not.toHaveBeenCalled();
    expect(markAsRead).not.toHaveBeenCalled();
    expect(starThread).not.toHaveBeenCalled();
  });

  it('ignores Space from the archive button so the row is not selected or marked as read', () => {
    const onSelectThread = vi.fn();
    render(<EmailInboxView onSelectThread={onSelectThread} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Arquivar thread' }), {
      key: ' ',
    });

    expect(onSelectThread).not.toHaveBeenCalled();
    expect(markAsRead).not.toHaveBeenCalled();
    expect(archiveThread).not.toHaveBeenCalled();
  });
});
