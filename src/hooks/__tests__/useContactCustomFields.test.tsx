import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const _mockSelect = vi.hoisted(() => vi.fn());
const _mockUpsert = vi.hoisted(() => vi.fn());
const _mockDelete = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock('@/lib/logger');
vi.mock('@/features/auth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u-test' }, session: null })),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn(() => ({ user: { id: 'u-test' } })) }));

import { useContactCustomFields } from '@/hooks/useContactCustomFields';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// UUID válido necessário: hook usa isValidUUID() para enabled flag
const VALID_CONTACT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_CF_ID = '550e8400-e29b-41d4-a716-446655440001';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useContactCustomFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: VALID_CF_ID,
                contact_id: VALID_CONTACT_ID,
                field_name: 'CPF',
                field_value: '123',
                field_type: 'text',
              },
            ],
            error: null,
          }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('fetches custom fields for a contact', async () => {
    const { result } = renderHook(() => useContactCustomFields(VALID_CONTACT_ID), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('contact_custom_fields');
  });

  it('does not fetch when contactId is undefined', () => {
    const { result } = renderHook(() => useContactCustomFields(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.fields).toEqual([]);
  });

  it('exposes addField function', () => {
    const { result } = renderHook(() => useContactCustomFields(VALID_CONTACT_ID), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.addField).toBe('function');
  });

  it('exposes removeField function', () => {
    const { result } = renderHook(() => useContactCustomFields(VALID_CONTACT_ID), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.removeField).toBe('function');
  });

  it('isLoading starts as false for undefined contactId', () => {
    const { result } = renderHook(() => useContactCustomFields(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
  });
});
