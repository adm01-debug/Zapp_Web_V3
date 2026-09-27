-- ============================================================================
-- Fix P0: zapp.rpc_sla_dashboard nao executava (SQLSTATE 42883)
-- ----------------------------------------------------------------------------
-- Sintoma: a RPC que alimenta o painel de SLA lancava, em runtime,
--     operator does not exist: uuid = character varying
--
-- Causa: o JOIN final comparava zapp.profiles.id (uuid) com o valor vindo de
--     zapp.contacts.assigned_to (character varying(100)):
--         JOIN zapp.profiles p ON p.id = ag.agent_id          -- 42883
--
-- Fix: cast no lado do uuid — mesmo padrao ja adotado no repositorio em
--     20260902040000_materialize_rbac_functions_and_policies.sql:129
--     (JOIN zapp.profiles p ON p.id::text = c.assigned_to)
--
-- Escopo: corpo IDENTICO ao que esta em PRODUCAO (extraido de
--     pg_get_functiondef em 2026-09-26) com APENAS o cast acrescentado, para
--     nao regredir nenhum outro trecho. CREATE OR REPLACE e idempotente; nao
--     ha DDL destrutivo.
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_sla_dashboard(p_period text DEFAULT 'today'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_temp'
AS $function$
DECLARE
  v_start_at timestamptz;
  v_overall  jsonb;
  v_by_agent jsonb;

  -- overall counts
  v_fr_on_time   int;
  v_fr_breached  int;
  v_res_on_time  int;
  v_res_breached int;
  v_total        int;
BEGIN
  PERFORM zapp.fn_require_app_user();

  -- Compute start date on the server (UTC clock)
  v_start_at := CASE p_period
    WHEN 'today'  THEN date_trunc('day',  NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    WHEN 'week'   THEN date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    WHEN 'month'  THEN date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ELSE NOW() - INTERVAL '365 days'
  END;

  -- Overall SLA aggregation
  SELECT
    COUNT(*) FILTER (WHERE s.first_response_at IS NOT NULL AND s.first_response_breached = false),
    COUNT(*) FILTER (WHERE s.first_response_breached = true),
    COUNT(*) FILTER (WHERE s.resolved_at IS NOT NULL AND s.resolution_breached = false),
    COUNT(*) FILTER (WHERE s.resolution_breached = true),
    COUNT(*)
  INTO
    v_fr_on_time,
    v_fr_breached,
    v_res_on_time,
    v_res_breached,
    v_total
  FROM zapp.conversation_sla s
  WHERE s.created_at >= v_start_at;

  v_overall := jsonb_build_object(
    'firstResponse', jsonb_build_object(
      'total',    v_fr_on_time + v_fr_breached,
      'onTime',   v_fr_on_time,
      'breached', v_fr_breached,
      'rate',     CASE WHEN (v_fr_on_time + v_fr_breached) > 0
                    THEN ROUND((v_fr_on_time::numeric / (v_fr_on_time + v_fr_breached)) * 100, 2)
                    ELSE 100
                  END
    ),
    'resolution', jsonb_build_object(
      'total',    v_res_on_time + v_res_breached,
      'onTime',   v_res_on_time,
      'breached', v_res_breached,
      'rate',     CASE WHEN (v_res_on_time + v_res_breached) > 0
                    THEN ROUND((v_res_on_time::numeric / (v_res_on_time + v_res_breached)) * 100, 2)
                    ELSE 100
                  END
    ),
    'totalConversations', v_total,
    'overallRate', CASE
      WHEN (v_fr_on_time + v_fr_breached + v_res_on_time + v_res_breached) > 0
      THEN ROUND(
        ((v_fr_on_time + v_res_on_time)::numeric
         / (v_fr_on_time + v_fr_breached + v_res_on_time + v_res_breached)) * 100, 2)
      ELSE 100
    END
  );

  -- Per-agent aggregation joined with profiles
  SELECT jsonb_agg(
    jsonb_build_object(
      'agentId',   p.id,
      'agentName', COALESCE(p.name, 'Agente'),
      'avatarUrl', p.avatar_url,
      'firstResponse', jsonb_build_object(
        'total',    ag.fr_on + ag.fr_br,
        'onTime',   ag.fr_on,
        'breached', ag.fr_br,
        'rate',     CASE WHEN (ag.fr_on + ag.fr_br) > 0
                      THEN ROUND((ag.fr_on::numeric / (ag.fr_on + ag.fr_br)) * 100, 2)
                      ELSE 100 END
      ),
      'resolution', jsonb_build_object(
        'total',    ag.res_on + ag.res_br,
        'onTime',   ag.res_on,
        'breached', ag.res_br,
        'rate',     CASE WHEN (ag.res_on + ag.res_br) > 0
                      THEN ROUND((ag.res_on::numeric / (ag.res_on + ag.res_br)) * 100, 2)
                      ELSE 100 END
      ),
      'overallRate', CASE
        WHEN (ag.fr_on + ag.fr_br + ag.res_on + ag.res_br) > 0
        THEN ROUND(
          ((ag.fr_on + ag.res_on)::numeric
           / (ag.fr_on + ag.fr_br + ag.res_on + ag.res_br)) * 100, 2)
        ELSE 100
      END
    )
    ORDER BY
      CASE WHEN (ag.fr_on + ag.fr_br + ag.res_on + ag.res_br) > 0
        THEN ((ag.fr_on + ag.res_on)::numeric / (ag.fr_on + ag.fr_br + ag.res_on + ag.res_br))
        ELSE 1 END DESC
  )
  INTO v_by_agent
  FROM (
    SELECT
      c.assigned_to                                                          AS agent_id,
      COUNT(*) FILTER (WHERE s.first_response_at IS NOT NULL
                         AND s.first_response_breached = false)              AS fr_on,
      COUNT(*) FILTER (WHERE s.first_response_breached = true)               AS fr_br,
      COUNT(*) FILTER (WHERE s.resolved_at IS NOT NULL
                         AND s.resolution_breached = false)                  AS res_on,
      COUNT(*) FILTER (WHERE s.resolution_breached = true)                   AS res_br
    FROM zapp.conversation_sla s
    LEFT JOIN zapp.contacts c ON c.id = s.contact_id
    WHERE s.created_at >= v_start_at
      AND c.assigned_to IS NOT NULL
    GROUP BY c.assigned_to
  ) ag
  JOIN zapp.profiles p ON p.id::text = ag.agent_id;

  RETURN jsonb_build_object(
    'overall',  v_overall,
    'byAgent',  COALESCE(v_by_agent, '[]'::jsonb),
    'startAt',  v_start_at,
    'period',   p_period,
    'computedAt', NOW()
  );
END;
$function$;
