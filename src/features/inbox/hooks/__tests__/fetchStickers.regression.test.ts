/**
 * Regressão (auditoria 2026-09-02): o catálogo de stickers passou a carregar
 * registros desativados (`is_active=false` — 213 mortos apontando para storage
 * inexistente) porque `fetchStickers` listava a tabela inteira sem filtro.
 * Este teste falha se o filtro `.eq('is_active', true)` for removido da query.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeRow {
  id: string;
  image_url: string;
  name: string;
  category: string;
  is_favorite: boolean;
  use_count: number;
  is_active: boolean;
}

const DATASET: FakeRow[] = [
  { id: 'a1', image_url: 'https://x/ok1.webp', name: 'ativo1', category: 'riso', is_favorite: false, use_count: 5, is_active: true },
  { id: 'a2', image_url: 'https://x/ok2.webp', name: 'ativo2', category: 'amor', is_favorite: true, use_count: 3, is_active: true },
  { id: 'd1', image_url: 'https://morto/404.webp', name: 'morto', category: 'outros', is_favorite: false, use_count: 99, is_active: false },
];

const eqCalls: Array<[string, unknown]> = [];

function makeBuilder() {
  let rows = [...DATASET];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
      return builder;
    }),
    order: vi.fn(() => builder),
    // A cadeia do PostgREST é awaitable: resolve com o dataset após os filtros.
    then: (resolve: (v: { data: FakeRow[]; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => makeBuilder()) },
}));

import { fetchStickers } from '../useStickerMutations';

describe('fetchStickers — regressão do filtro is_active', () => {
  beforeEach(() => {
    eqCalls.length = 0;
  });

  it('não retorna stickers desativados (mortos ficam fora do catálogo)', async () => {
    const result = await fetchStickers();
    expect(result.map((s) => s.id).sort()).toEqual(['a1', 'a2']);
    expect(result.some((s) => s.id === 'd1')).toBe(false);
  });

  it('aplica o filtro is_active=true na query (proteção direta da regressão)', async () => {
    await fetchStickers();
    expect(eqCalls).toContainEqual(['is_active', true]);
  });
});
