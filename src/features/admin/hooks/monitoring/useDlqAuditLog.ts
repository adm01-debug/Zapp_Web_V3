import type { Json } from '@/integrations/supabase/schema';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/features/auth';
import { toRecordOrNull } from './monitoringSchemas';

// E60: rpc_dlq_list_audit existe fisicamente em zapp mas types.ts gerado a
// colocou em public (schema zapp inteiro ausente do gerado — ver
// types-manual.ts linha 1-15). Anotamos o Row real no boundary.
type _DlqAuditRow = {
  action: string;
  created_at: string;
  details: Json;
  entity_id: string;
  id: string;
  user_email: string;
  user_id: string;
  user_name: string;
};

/**
 * Histórico de auditoria das operações da DLQ (Dead-Letter Queue).
 *
 * Lê de `zapp.audit_logs` (entity_type='failed_messages') via
 * `rpc_dlq_list_audit`, que faz JOIN com `profiles` para trazer o nome/email
 * de quem executou. Acesso restrito a admin (RPC valida via `has_role`).
 */

export type DlqAuditAction =
  | 'dlq_reprocess_trigger'
  | 'dlq_reprocess_result'
  | 'dlq_retry_now'
  | 'dlq_abandon'
  | 'dlq_bulk_retry'
  | 'dlq_bulk_abandon';

export interface DlqAuditEntry {
  id: string;
  action: DlqAuditAction | string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
}

export interface UseDlqAuditLogOptions {
  limit?: number;
  action?: DlqAuditAction | 'all' | null;
  enabled?: boolean;
  page?: number;
}

export function useDlqAuditLog(opts: UseDlqAuditLogOptions = {}) {
  const { limit = 30, action = null, enabled = true, page = 0 } = opts;
  const { isDev } = useUserRole();

  const [currentPage, setCurrentPage] = useState(page);

  // Reset to page 0 when the caller changes filter dimensions.
  useEffect(() => {
    setCurrentPage(0);
  }, [action, limit]);
  // Re-sync if caller changes the controlled `page` prop.
  useEffect(() => {
    setCurrentPage(page);
  }, [page]);

  const query = useQuery<DlqAuditEntry[]>({
    queryKey: queryKeys.adminOps.dlqAuditLogFiltered({ limit, action, page: currentPage }),
    enabled: enabled && isDev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_dlq_list_audit', {
        p_limit: limit,
        p_action: action ?? undefined,
        p_offset: currentPage * limit,
      });
      if (error) throw error;
      // E60: RPC tipada via anotacao no boundary (ver comentario no topo do arquivo).
      const list = (data ?? []) as _DlqAuditRow[];
      return list.map((r): DlqAuditEntry => ({
        id: r.id,
        action: r.action,
        entity_id: r.entity_id,
        details: toRecordOrNull(r.details),
        created_at: r.created_at,
        user_id: r.user_id,
        user_name: r.user_name,
        user_email: r.user_email,
      }));
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  return { ...query, currentPage, setCurrentPage };
}
