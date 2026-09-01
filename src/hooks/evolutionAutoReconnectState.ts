const DISCONNECTED_STATES = new Set(['close', 'closed', 'disconnected']);

/**
 * Reconnect automatico exige evidencia positiva de desconexao. Payload vazio,
 * formato inesperado e estado `unknown` representam falha inconclusiva do
 * status endpoint e nunca autorizam uma mutacao na instancia Evolution.
 */
export function isConclusiveEvolutionDisconnect(state: unknown): boolean {
  return typeof state === 'string' && DISCONNECTED_STATES.has(state.trim().toLowerCase());
}
