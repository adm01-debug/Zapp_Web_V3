/**
 * E15 — A4: useTicketStatus retorna defaults seguros quando contactId é null/undefined.
 * Garante que o destructure em TicketActionsBar nunca explode.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock store e auth antes de importar o hook
vi.mock('@/lib/inbox/ticketStore', () => ({
  ticketStore: {
    subscribe: vi.fn(() => () => {}),
    get: vi.fn(() => null),
    bootstrap: vi.fn(),
    setStatus: vi.fn(),
    assign: vi.fn(),
    snapshot: vi.fn(() => ({})),
  },
}));

vi.mock('@/features/auth', () => ({
  useAuth: vi.fn(() => ({ profile: null })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { useTicketStatus } from '../useTicketStatus';

describe('useTicketStatus — contexto ausente', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna status "open" quando contactId é null', () => {
    const { result } = renderHook(() => useTicketStatus(null));
    expect(result.current.status).toBe('open');
    expect(result.current.assignedTo).toBeNull();
    expect(result.current.events).toEqual([]);
  });

  it('retorna status "open" quando contactId é undefined', () => {
    const { result } = renderHook(() => useTicketStatus(undefined));
    expect(result.current.status).toBe('open');
    expect(result.current.assignedTo).toBeNull();
  });

  it('não chama bootstrap quando contactId é null', () => {
    const { ticketStore } = await import('@/lib/inbox/ticketStore');
    renderHook(() => useTicketStatus(null));
    expect(ticketStore.bootstrap).not.toHaveBeenCalled();
  });

  it('setStatus não lança quando contactId é null', () => {
    const { result } = renderHook(() => useTicketStatus(null));
    expect(() => result.current.setStatus('resolved')).not.toThrow();
  });
});
