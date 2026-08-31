import { describe, expect, it } from 'vitest';
import { isConclusiveEvolutionDisconnect } from './evolutionAutoReconnectState';

describe('isConclusiveEvolutionDisconnect', () => {
  it.each(['close', 'closed', 'disconnected', ' DISCONNECTED '])(
    'aceita estado explicitamente desconectado: %s',
    (state) => expect(isConclusiveEvolutionDisconnect(state)).toBe(true)
  );

  it.each([undefined, null, '', 'unknown', 'connecting', 'open', {}, 503])(
    'rejeita falha/estado inconclusivo: %#',
    (state) => expect(isConclusiveEvolutionDisconnect(state)).toBe(false)
  );
});
