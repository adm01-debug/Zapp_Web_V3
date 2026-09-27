/**
 * Registro canônico de tabelas externas do CRM 360.
 *
 * Derivado do schema-catalog.json em 2026-09-06: nenhuma das ExternalTableName
 * existe no banco zapp (resquício do CRM "external" pré-consolidação).
 * Quando `exists === false`, queryExternal retorna imediatamente sem request
 * ao PostgREST — elimina os PGRST205 (Bug A da onda console 2026-09-06).
 *
 * Para adicionar uma tabela real, setar `exists: true` APÓS a migration
 * correspondente ser aplicada em produção.
 */

export interface ExternalTableEntry {
  exists: boolean;
}

const registry: Record<string, ExternalTableEntry> = {
  // ── Tabelas CRM 360 — ausentes do banco (PGRST205 confirmado ao vivo) ──
  customers: { exists: false },
  sales: { exists: false },
  suppliers: { exists: false },
  carriers: { exists: false },
  company_rfm_scores: { exists: false },
  leads: { exists: false },
  orders: { exists: false },
  deals: { exists: false },
  quotations: { exists: false },
  sales_activities: { exists: false },
  salespeople: { exists: false },
  interactions: { exists: false },
};

/**
 * Retorna a entrada do registry para a tabela, ou undefined se não catalogada.
 * Tabelas não listadas aqui são tratadas como existentes (sem guarda).
 */
export function getExternalTableEntry(table: string): ExternalTableEntry | undefined {
  return registry[table];
}

/** true se a tabela está catalogada como inexistente no banco */
export function isExternalTableUnavailable(table: string): boolean {
  const entry = registry[table];
  return entry !== undefined && !entry.exists;
}
