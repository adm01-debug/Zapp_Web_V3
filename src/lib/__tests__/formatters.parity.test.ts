/**
 * formatters.parity.test.ts — Wave 5 (2026-07-06)
 * Materializa a simulação de paridade (894 execuções) que provou a equivalência
 * das implementações consolidadas. Asserts TZ-agnósticos para estabilidade em CI.
 */
import { describe, it, expect } from 'vitest';
import {
  formatDateTimeCompact,
  formatTimeHMS,
  formatBytesCompact,
  getInitialsFromNameOrEmail,
  formatWhatsAppText,
} from '@/lib/formatters';

describe('formatDateTimeCompact (paridade: FailedMessageTableRow/AdminAlertHistory/AdminWebhookEvents)', () => {
  it('null → em-dash', () => expect(formatDateTimeCompact(null)).toBe('—'));
  it('vazio → em-dash', () => expect(formatDateTimeCompact('')).toBe('—'));
  it('ISO válido → dd/MM HH:mm:ss', () =>
    expect(formatDateTimeCompact('2026-07-06T14:35:07Z')).toMatch(
      /^\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/
    ));
  it('29 fev bissexto não explode', () =>
    expect(formatDateTimeCompact('2024-02-29T12:00:00Z')).toMatch(/^29\/02 /));
});

describe('formatTimeHMS (paridade: QrAttemptHistory/AgentRecentSendsPopover)', () => {
  it('ISO válido → HH:MM:SS', () =>
    expect(formatTimeHMS('2026-07-06T14:35:07Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/));
  it('meia-noite ok', () =>
    expect(formatTimeHMS('2026-01-01T00:00:00')).toMatch(/^\d{2}:\d{2}:\d{2}$/));
});

describe('formatBytesCompact (paridade: EmailAttachmentPreview/pttLimits)', () => {
  const cases: Array<[number, string]> = [
    [0, '0 B'],
    [1, '1 B'],
    [999, '999 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1048575, '1024.0 KB'],
    [1048576, '1.0 MB'],
    [123456789, '117.7 MB'],
  ];
  for (const [inp, out] of cases)
    it(`${inp} → ${out}`, () => expect(formatBytesCompact(inp)).toBe(out));
});

describe('getInitialsFromNameOrEmail (paridade Wave 1: componentes de e-mail)', () => {
  it('nome duplo', () => expect(getInitialsFromNameOrEmail('João Silva')).toBe('JS'));
  it('nome triplo corta em 2', () =>
    expect(getInitialsFromNameOrEmail('Ana Beatriz Costa')).toBe('AB'));
  it('fallback e-mail', () => expect(getInitialsFromNameOrEmail(null, 'zeta@x.com')).toBe('Z'));
  it('e-mail vazio não explode (fix do crash latente)', () =>
    expect(getInitialsFromNameOrEmail(null, '')).toBe('?'));
  it('tudo nulo', () => expect(getInitialsFromNameOrEmail(null, null)).toBe('?'));
});

describe('formatWhatsAppText (P15 — E65)', () => {
  it('caso 1: texto sem marcação passa sem alterar', () =>
    expect(formatWhatsAppText('texto simples')).toBe('texto simples'));

  it('caso 2: *bold* → <strong>bold</strong>', () =>
    expect(formatWhatsAppText('*bold*')).toBe('<strong>bold</strong>'));

  it('caso 3: _italic_ → <em>italic</em>', () =>
    expect(formatWhatsAppText('_italic_')).toBe('<em>italic</em>'));

  it('caso 4: ~strike~ → <del>strike</del>', () =>
    expect(formatWhatsAppText('~strike~')).toBe('<del>strike</del>'));

  it('caso 5: `code` → <code>code</code>', () =>
    expect(formatWhatsAppText('`code`')).toBe('<code>code</code>'));

  it('caso 6: aninhado *_negrito itálico_* → strong+em', () =>
    expect(formatWhatsAppText('*_negrito itálico_*')).toBe(
      '<strong><em>negrito itálico</em></strong>'
    ));

  it('caso 7: múltiplas ocorrências no mesmo texto', () =>
    expect(formatWhatsAppText('*a* e *b*')).toBe('<strong>a</strong> e <strong>b</strong>'));

  it('caso 8: escape \\* preserva literal *', () =>
    expect(formatWhatsAppText('\\*não formatado\\*')).toBe('*não formatado*'));
});
