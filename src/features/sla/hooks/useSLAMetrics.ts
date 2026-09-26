import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Hook: Period Filter. */
export type PeriodFilter = 'today' | 'week' | 'month' | 'all';

interface SLAMetric {
  total: number;
  onTime: number;
  breached: number;
  rate: number;
}

interface AgentSLAMetric {
  agentId: string;
  agentName: string;
  avatarUrl?: string;
  firstResponse: SLAMetric;
  resolution: SLAMetric;
  overallRate: number;
}

/** Hook: SLADashboard Data. */
export interface SLADashboardData {
  overall: {
    firstResponse: SLAMetric;
    resolution: SLAMetric;
    totalConversations: number;
    overallRate: number;
  };
  byAgent: AgentSLAMetric[];
}

// Shape returned by rpc_sla_dashboard (JSONB decoded by postgrest)
interface RPCResult {
  overall: SLADashboardData['overall'];
  byAgent: AgentSLAMetric[];
  startAt: string;
  period: string;
  computedAt: string;
}

/** Valida o shape do JSONB em runtime — substitui o cast cego (`as unknown as`)
 *  para que um payload malformado do postgrest vire erro tratável, e não dados
 *  silenciosamente incompletos na UI. */
function isRPCResult(value: unknown): value is RPCResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.overall === 'object' && v.overall !== null && Array.isArray(v.byAgent);
}

async function fetchSLAMetrics(period: PeriodFilter): Promise<SLADashboardData> {
  // Dates are computed server-side via NOW() (UTC clock) — not browser new Date().
  // This eliminates timezone drift and makes the filter reproducible regardless
  // of the client's locale/timezone. (Dim-11 fix: 2026-09-06)
  const { data, error } = await supabase.rpc('rpc_sla_dashboard', { p_period: period });

  if (error) throw error;

  if (!isRPCResult(data)) {
    throw new Error('rpc_sla_dashboard retornou um formato inesperado');
  }

  return {
    overall: data.overall,
    byAgent: data.byAgent ?? [],
  };
}

/** Hook: use SLAMetrics. */
export const useSLAMetrics = (period: PeriodFilter = 'today') => {
  const { data = null, isLoading: loading } = useQuery({
    queryKey: queryKeys.sla.metrics(period),
    queryFn: () => fetchSLAMetrics(period),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return { data, loading };
};
