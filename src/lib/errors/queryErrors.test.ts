import { describe, expect, it } from 'vitest';
import { isPermanentQueryError, tanstackRetry } from './queryErrors';

describe('queryErrors — erros locais da fila Supabase', () => {
  it.each([
    new Error('Supabase queue saturated — request dropped'),
    new Error('Supabase queue wait timed out'),
    { message: 'SupabaseQueueSaturatedError: request dropped' },
    { message: 'SupabaseQueueTimeoutError: wait timed out' },
  ])('nao retenta erro normalizado apenas pela mensagem: %#', (error) => {
    expect(isPermanentQueryError(error)).toBe(true);
    expect(tanstackRetry(0, error)).toBe(false);
  });
});
