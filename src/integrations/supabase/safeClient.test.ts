import { describe, it, expect, vi } from 'vitest';
import { safeClient } from './safeClient';

// Mock do supabase client
vi.mock('./client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: { success: true }, error: null })),
    },
  },
}));

describe('safeClient Masking', () => {
  it('should mask sensitive keys in detail objects', () => {
    const sensitiveData = {
      token: 'secret-token-123',
      apiKey: 'api-key-456',
      user: {
        email: 'test@example.com',
        password: 'password123',
      },
      normalField: 'visible',
    };

    const masked = safeClient.maskSensitiveData(sensitiveData) as Record<string, unknown>;

    expect(masked.token).toBe('***MASKED***');
    expect(masked.apiKey).toBe('***MASKED***');
    expect((masked.user as Record<string, string>).password).toBe('***MASKED***');
    expect((masked.user as Record<string, string>).email).toBe('te***@example.com');
    expect(masked.normalField).toBe('visible');
  });

  it('should mask email strings', () => {
    expect(safeClient.maskEmail('john.doe@email.com')).toBe('jo***@email.com');
    expect(safeClient.maskEmail('a@b.com')).toBe('***@b.com');
  });

  it('should apply general masking to long suspicious strings', () => {
    const longToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const data = { authorization: longToken, name: 'John' };
    const result = safeClient.maskSensitiveData(data) as Record<string, string>;
    expect(result.name).toBe('John');
  });

  it('should handle arrays of objects', () => {
    const arrayData = [
      { email: 'test@example.com', token: 'secret' },
      { email: 'user@test.com', token: 'another-secret' },
    ];
    const masked = safeClient.maskSensitiveData(arrayData) as Array<Record<string, string>>;
    expect(masked[0].token).toBe('***MASKED***');
    expect(masked[1].token).toBe('***MASKED***');
    expect(masked[0].email).toBe('te***@example.com');
  });
});

describe('safeClient formatError', () => {
  it('preserva a identidade e os metadados de um Error de saturacao', () => {
    const source = Object.assign(new Error('Supabase queue saturated — request dropped'), {
      name: 'SupabaseQueueSaturatedError',
      code: 'QUEUE_SATURATED',
      status: 503,
    });

    const formatted = safeClient.formatError(source) as Error & {
      code?: string;
      status?: number;
    };

    expect(formatted).toBe(source);
    expect(formatted.name).toBe('SupabaseQueueSaturatedError');
    expect(formatted.code).toBe('QUEUE_SATURATED');
    expect(formatted.status).toBe(503);
  });

  it('copia name, code e status de um erro PostgREST plain-object', () => {
    const source = {
      name: 'SupabaseQueueTimeoutError',
      message: 'Supabase queue wait timed out',
      code: 'QUEUE_TIMEOUT',
      status: 503,
      details: 'queueLength=80',
    };

    const formatted = safeClient.formatError(source) as Error & {
      code?: string;
      status?: number;
      details?: string;
      cause?: unknown;
    };

    expect(formatted).not.toBe(source);
    expect(formatted.name).toBe('SupabaseQueueTimeoutError');
    expect(formatted.code).toBe('QUEUE_TIMEOUT');
    expect(formatted.status).toBe(503);
    expect(formatted.details).toBe('queueLength=80');
    expect(formatted.cause).toBe(source);
  });

  it('mantem a mensagem amigavel para recurso inexistente sem perder a causa', () => {
    const source = Object.assign(new Error('relation contacts does not exist'), {
      code: '42P01',
    });

    const formatted = safeClient.formatError(source) as Error & {
      code?: string;
      cause?: unknown;
    };

    expect(formatted).not.toBe(source);
    expect(formatted.message).toBe('Recurso indisponível: relation contacts does not exist');
    expect(formatted.code).toBe('42P01');
    expect(formatted.cause).toBe(source);
  });
});
