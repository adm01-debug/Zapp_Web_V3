/**
 * Utilitários de asserção para testes.
 *
 * Com `noUncheckedIndexedAccess` habilitado, qualquer acesso indexado a um array
 * tem tipo `T | undefined`. Estes helpers estreitam o tipo de forma explícita e
 * falham com mensagem clara quando o valor realmente não existe — em vez de
 * mascarar o problema com `!`, `any` ou supressões de tipo.
 */

/** Garante que `value` está definido, estreitando o tipo no escopo do chamador. */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Esperava um valor definido, recebeu null/undefined',
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/** Retorna o item do índice informado, falhando caso ele não exista. */
export function at<T>(items: readonly T[], index: number, label = 'array'): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(
      `Esperava um item em ${label}[${index}], mas o ${label} tem ${items.length} item(ns)`,
    );
  }
  return value;
}
