import { describe, expect, it } from 'vitest';
import { isAbortLikeError } from '@/lib/abortError';

describe('isAbortLikeError — AuthProvider contract', () => {
  it.each([
    { message: 'AbortError: The operation was aborted' },
    { message: 'signal is aborted without reason' },
    { message: 'AbortError: Supabase slot acquire aborted' },
    { message: 'Request cancelled during page unload' },
  ])('recognizes wrapped PostgREST and semaphore aborts: $message', (error) => {
    expect(isAbortLikeError(error)).toBe(true);
  });

  it('does not hide ordinary failures or invalid values', () => {
    expect(isAbortLikeError(new Error('network unavailable'))).toBe(false);
    expect(isAbortLikeError({ message: 'permission denied' })).toBe(false);
    expect(isAbortLikeError(null)).toBe(false);
    expect(isAbortLikeError('AbortError as an unstructured string')).toBe(false);
  });
});
