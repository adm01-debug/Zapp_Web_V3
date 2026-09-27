import { describe, it, expect, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { dbFrom } from '@/integrations/datasource/db';
import { getEntityMapping } from '@/integrations/datasource/registry';

describe('conversation_closures no datasource (regressão do ratchet data-layer)', () => {
  it('está registrada no registry como entidade lovable', () => {
    expect(getEntityMapping('conversation_closures')).toEqual({
      client: 'lovable',
      table: 'conversation_closures',
    });
  });

  it('dbFrom roteia para supabase.from("conversation_closures") sem lançar', () => {
    mockFrom.mockReturnValue({ select: vi.fn() });
    expect(() => dbFrom('conversation_closures')).not.toThrow();
    expect(mockFrom).toHaveBeenCalledWith('conversation_closures');
  });
});
