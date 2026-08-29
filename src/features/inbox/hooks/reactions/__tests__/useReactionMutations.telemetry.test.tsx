import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReactionMutations } from '../useReactionMutations';

const mocks = vi.hoisted(() => ({
  mutationConfigs: [] as Array<{
    onSuccess?: (data: unknown, emoji: string) => void;
  }>,
  info: vi.fn(),
  auditInsert: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: { onSuccess?: (data: unknown, emoji: string) => void }) => {
    mocks.mutationConfigs.push(config);
    return { mutateAsync: vi.fn() };
  }),
  useQueryClient: vi.fn(() => ({
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('@/hooks/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ sendReaction: vi.fn() }),
}));

vi.mock('@/integrations/datasource/db', () => ({ dbFrom: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mocks.auditInsert })),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: mocks.info, warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { dismiss: vi.fn(), error: vi.fn() },
}));

describe('useReactionMutations — ownership e origem da telemetria', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutationConfigs.length = 0;
    mocks.auditInsert.mockResolvedValue({ error: null });
  });

  it.each([
    { source: 'bar' as const, expectedAction: 'add' },
    { source: 'quick' as const, expectedAction: 'quick_add' },
  ])(
    'emite um único evento $expectedAction para origem $source',
    async ({ source, expectedAction }) => {
      renderHook(() => useReactionMutations('message-1', 'profile-1', { reactionSource: source }));

      const addMutation = mocks.mutationConfigs[0];
      expect(addMutation?.onSuccess).toBeTypeOf('function');

      act(() => addMutation.onSuccess?.(null, '👍'));

      expect(mocks.info).toHaveBeenCalledTimes(1);
      expect(mocks.info).toHaveBeenCalledWith(
        `[Analytics] Reaction Event: ${expectedAction}`,
        expect.objectContaining({ messageId: 'message-1', emoji: '👍', status: 'success' })
      );
      await waitFor(() =>
        expect(mocks.auditInsert).toHaveBeenCalledWith(
          expect.objectContaining({ action: `Reaction Event: ${expectedAction}` })
        )
      );
      expect(mocks.auditInsert).toHaveBeenCalledTimes(1);
    }
  );
});
