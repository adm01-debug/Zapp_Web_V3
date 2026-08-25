/**
 * Constante que define a janela de tempo máxima (ms) para mensagens do mesmo
 * sender serem consideradas parte do mesmo "grupo visual" no chat.
 * 5 minutos: se duas mensagens do mesmo sender têm intervalo > 5min, a segunda
 * abre um novo grupo (exibe avatar/nome separado).
 */
export const SAME_GROUP_MS = 5 * 60 * 1000;

/**
 * Converte um timestamp de mensagem para milissegundos desde epoch.
 * Retorna NaN para null/undefined, propagando incerteza na comparação.
 *
 * Motivação: `new Date(null) = epoch (0)` faria mensagens sem timestamp
 * serem agrupadas erroneamente entre si (diff=0 ≤ 5min → grouped).
 * Com NaN: `NaN - NaN = NaN` e `isNaN(NaN) = true` → forçamos isFirstInGroup=true,
 * garantindo que mensagens sem timestamp nunca formem um grupo visual.
 */
const toMs = (t: string | number | null | undefined): number =>
  t == null ? NaN : new Date(t).getTime();

/**
 * Dado um array de mensagens, calcula para cada uma se é a primeira e/ou
 * última de seu grupo visual.
 *
 * Regras de agrupamento:
 * - Mesmo sender E intervalo ≤ SAME_GROUP_MS → mesmo grupo
 * - Sender diferente → novo grupo
 * - Intervalo > SAME_GROUP_MS → novo grupo
 * - Timestamp inválido (null/undefined) em qualquer das duas mensagens
 *   comparadas → NÃO agrupa (isFirstInGroup = true), por incerteza de ordem
 *
 * NOTA IMPORTANTE: `?? NaN` sozinho é insuficiente — `NaN > SAME_GROUP_MS`
 * retorna false, então sem o guard `isNaN(diffPrev) ||` a condição
 * isFirstInGroup seria false (agrupadas erroneamente). O guard explícito
 * é necessário e está coberto pelos testes P0-12/GAP-2.
 *
 * @example
 *   buildGroupInfo([{sender:'A', timestamp:'T1'}, {sender:'A', timestamp:'T2'}])
 *   // [{isFirstInGroup:true, isLastInGroup:false}, {isFirstInGroup:false, isLastInGroup:true}]
 */
export function buildGroupInfo<
  T extends { sender?: string | null; timestamp?: string | number | null },
>(messages: T[]): { isFirstInGroup: boolean; isLastInGroup: boolean }[] {
  return messages.map((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];

    const ts     = toMs(msg.timestamp);
    const prevTs = prev ? toMs(prev.timestamp) : NaN;
    const nextTs = next ? toMs(next.timestamp) : NaN;

    // diffPrev = NaN se qualquer ts for inválido → isNaN(diffPrev) = true → novo grupo
    const diffPrev = ts - prevTs;
    const isFirstInGroup =
      !prev ||
      prev.sender !== msg.sender ||
      isNaN(diffPrev) ||          // timestamp inválido em msg ou prev → não agrupar
      diffPrev > SAME_GROUP_MS;

    const diffNext = nextTs - ts;
    const isLastInGroup =
      !next ||
      next.sender !== msg.sender ||
      isNaN(diffNext) ||          // timestamp inválido em msg ou next → não agrupar
      diffNext > SAME_GROUP_MS;

    return { isFirstInGroup, isLastInGroup };
  });
}
