import { describe, expect, it } from 'vitest';
import { normalizeTeamMessageStatus } from '../teamMessageStatus';

describe('normalizeTeamMessageStatus', () => {
  it.each([
    'pending',
    'sending',
    'retrying',
    'sent',
    'delivered',
    'read',
    'played',
    'failed',
    'failed_auth',
    'failed_retries',
  ] as const)('preserva o status conhecido %s', (status) => {
    expect(normalizeTeamMessageStatus(status)).toBe(status);
  });

  it.each([undefined, null, '', 'queued', 'SENT'])('usa sent para valor inválido %s', (status) => {
    expect(normalizeTeamMessageStatus(status)).toBe('sent');
  });
});
