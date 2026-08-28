import { describe, expect, it } from 'vitest';
import { buildGroupInfo, SAME_GROUP_MS } from '../chatGroupInfo';

describe('buildGroupInfo — contrato Date do domínio', () => {
  it('agrupa instâncias Date válidas do mesmo remetente dentro da janela', () => {
    const start = new Date('2026-08-28T12:00:00.000Z');
    const messages = [
      { sender: 'contact', timestamp: start },
      { sender: 'contact', timestamp: new Date(start.getTime() + SAME_GROUP_MS) },
    ];

    expect(buildGroupInfo(messages)).toEqual([
      { isFirstInGroup: true, isLastInGroup: false },
      { isFirstInGroup: false, isLastInGroup: true },
    ]);
  });

  it('separa instâncias Date além da janela de agrupamento', () => {
    const start = new Date('2026-08-28T12:00:00.000Z');
    const messages = [
      { sender: 'agent', timestamp: start },
      { sender: 'agent', timestamp: new Date(start.getTime() + SAME_GROUP_MS + 1) },
    ];

    expect(buildGroupInfo(messages)).toEqual([
      { isFirstInGroup: true, isLastInGroup: true },
      { isFirstInGroup: true, isLastInGroup: true },
    ]);
  });

  it('trata Date inválida como incerteza e não agrupa mensagens', () => {
    const messages = [
      { sender: 'agent', timestamp: new Date(Number.NaN) },
      { sender: 'agent', timestamp: new Date(Number.NaN) },
    ];

    expect(buildGroupInfo(messages)).toEqual([
      { isFirstInGroup: true, isLastInGroup: true },
      { isFirstInGroup: true, isLastInGroup: true },
    ]);
  });
});
