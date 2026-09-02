import { describe, expect, it } from 'vitest';
import { contactEmailSchema } from '@/shared/validation';

describe('contactEmailSchema — validação de e-mail de contato', () => {
  it('aceita e-mails válidos', () => {
    expect(contactEmailSchema.safeParse('joao@promobrindes.com.br').success).toBe(true);
  });

  it('aceita ausência de e-mail (campo opcional)', () => {
    expect(contactEmailSchema.safeParse(undefined).success).toBe(true);
    expect(contactEmailSchema.safeParse(null).success).toBe(true);
  });

  it('rejeita formatos inválidos (regressão: useContactFormV3 antes não validava formato algum)', () => {
    expect(contactEmailSchema.safeParse('invalido').success).toBe(false);
    expect(contactEmailSchema.safeParse('a@').success).toBe(false);
    expect(contactEmailSchema.safeParse('a@b').success).toBe(false);
  });

  it('rejeita e-mail acima do limite de tamanho', () => {
    const tooLong = `${'a'.repeat(250)}@x.com`;
    expect(contactEmailSchema.safeParse(tooLong).success).toBe(false);
  });
});
