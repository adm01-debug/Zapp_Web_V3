import { describe, expect, it } from 'vitest';
import { isTransientMarkReadError } from './markMessagesRead';

describe('isTransientMarkReadError', () => {
  it.each([
    new TypeError('Failed to fetch'),
    { name: 'SupabaseQueueSaturatedError', message: 'request dropped' },
    { name: 'SupabaseQueueTimeoutError', message: 'wait timed out' },
    { status: 429, message: 'Too Many Requests' },
    { statusCode: '503', message: 'Service Unavailable' },
    { message: 'Network request failed' },
  ])('aceita somente falha transitoria %#', (error) => {
    expect(isTransientMarkReadError(error)).toBe(true);
  });

  it.each([
    { status: 400, message: 'invalid input syntax for uuid' },
    { status: 401, message: 'Unauthorized' },
    { status: 403, message: 'Forbidden' },
    { code: 'PGRST204', message: "column 'is_read' was not found" },
    { code: '42501', message: 'permission denied' },
    new Error('unknown application failure'),
  ])('rejeita falha permanente ou desconhecida %#', (error) => {
    expect(isTransientMarkReadError(error)).toBe(false);
  });
});
