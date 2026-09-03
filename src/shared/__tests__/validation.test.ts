/**
 * Tests para validation.ts - Schemas Zod centralizados
 * Reescrito de Deno para vitest (import https://deno.land/ incompatível com Node).
 */
import { describe, it, expect } from 'vitest';
import {
  sendMessageSchema,
  createContactSchema,
  retryConfigSchema,
  validateInput,
  safeValidateInput,
  messageContentSchema,
  contactPhoneSchema,
} from '../validation.ts';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('messageContentSchema', () => {
  it('deve aceitar mensagem válida', () => {
    expect(messageContentSchema.safeParse('Olá, tudo bem?').success).toBe(true);
  });

  it('deve rejeitar mensagem vazia', () => {
    expect(messageContentSchema.safeParse('').success).toBe(false);
  });

  it('deve rejeitar mensagem muito longa', () => {
    expect(messageContentSchema.safeParse('a'.repeat(5000)).success).toBe(false);
  });

  it('deve rejeitar só espaços', () => {
    expect(messageContentSchema.safeParse('     ').success).toBe(false);
  });
});

describe('contactPhoneSchema', () => {
  it('deve aceitar telefone BR válido', () => {
    expect(contactPhoneSchema.safeParse('11999998888').success).toBe(true);
  });

  it('deve aceitar telefone com formatação', () => {
    expect(contactPhoneSchema.safeParse('(11) 99999-8888').success).toBe(true);
  });

  it('deve rejeitar telefone curto', () => {
    expect(contactPhoneSchema.safeParse('123').success).toBe(false);
  });
});

describe('sendMessageSchema', () => {
  it('deve aceitar payload completo válido', () => {
    expect(
      sendMessageSchema.safeParse({ contactId: VALID_UUID, content: 'Olá!', messageType: 'text' }).success
    ).toBe(true);
  });

  it('deve rejeitar contactId inválido (não-UUID)', () => {
    expect(
      sendMessageSchema.safeParse({ contactId: 'not-a-uuid', content: 'Olá!' }).success
    ).toBe(false);
  });

  it("deve usar messageType default 'text'", () => {
    const result = sendMessageSchema.safeParse({ contactId: VALID_UUID, content: 'Olá!' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.messageType).toBe('text');
  });

  it('deve aceitar com mediaUrl', () => {
    expect(
      sendMessageSchema.safeParse({
        contactId: VALID_UUID,
        content: 'Imagem',
        messageType: 'image',
        mediaUrl: 'https://example.com/image.jpg',
      }).success
    ).toBe(true);
  });

  it('deve aceitar mediaPayload null', () => {
    expect(
      sendMessageSchema.safeParse({ contactId: VALID_UUID, content: 'Test', mediaPayload: null }).success
    ).toBe(true);
  });
});

describe('createContactSchema', () => {
  it('deve aceitar contato válido', () => {
    expect(
      createContactSchema.safeParse({ name: 'João Silva', phone: '11999998888', email: 'joao@example.com', tags: [] }).success
    ).toBe(true);
  });

  it('deve rejeitar sem nome', () => {
    expect(createContactSchema.safeParse({ phone: '11999998888' }).success).toBe(false);
  });

  it('deve rejeitar mais de 50 tags', () => {
    const tags = Array(60).fill(VALID_UUID);
    expect(createContactSchema.safeParse({ name: 'João', phone: '11999998888', tags }).success).toBe(false);
  });

  it('deve aceitar sem email (opcional)', () => {
    expect(createContactSchema.safeParse({ name: 'João', phone: '11999998888' }).success).toBe(true);
  });

  it('deve aceitar com tags vazias', () => {
    expect(createContactSchema.safeParse({ name: 'João', phone: '11999998888', tags: [] }).success).toBe(true);
  });
});

describe('retryConfigSchema', () => {
  it('deve aceitar config válida', () => {
    expect(
      retryConfigSchema.safeParse({ maxRetries: 3, baseBackoffMs: 800, maxBackoffMs: 6000, timeoutMs: 30_000 }).success
    ).toBe(true);
  });

  it('deve rejeitar maxBackoffMs < baseBackoffMs', () => {
    expect(
      retryConfigSchema.safeParse({ maxRetries: 3, baseBackoffMs: 800, maxBackoffMs: 500, timeoutMs: 30_000 }).success
    ).toBe(false);
  });

  it('deve rejeitar timeoutMs < baseBackoffMs', () => {
    expect(
      retryConfigSchema.safeParse({ maxRetries: 3, baseBackoffMs: 800, maxBackoffMs: 6000, timeoutMs: 500 }).success
    ).toBe(false);
  });

  it('deve rejeitar maxRetries > 10', () => {
    expect(
      retryConfigSchema.safeParse({ maxRetries: 20, baseBackoffMs: 800, maxBackoffMs: 6000, timeoutMs: 30_000 }).success
    ).toBe(false);
  });
});

describe('validateInput', () => {
  it('deve retornar data em caso de sucesso', () => {
    expect(validateInput(messageContentSchema, 'Olá!')).toBe('Olá!');
  });

  it('deve throw em caso de erro', () => {
    expect(() => validateInput(messageContentSchema, '')).toThrow();
  });
});

describe('safeValidateInput', () => {
  it('deve retornar ok:true em caso de sucesso', () => {
    expect(safeValidateInput(messageContentSchema, 'Olá!').ok).toBe(true);
  });

  it('deve retornar ok:false sem throw', () => {
    const result = safeValidateInput(messageContentSchema, '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeDefined();
  });
});
