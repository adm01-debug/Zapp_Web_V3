-- P100_EVO_FIXES_MANUAL.sql — Correções PLANO-100 para schema evo
-- Aplicar via VPS (psql direto) ou via evolution-stack repo.
-- NÃO incluir em migrations deste repo (gate E42 bloqueia DDL evo).
--
-- AG-1/FIX-1  fn_recon_coverage_snapshot: alerta quando v_src=0
-- AG-1/FIX-2  fdw_evolution_message: messageTimestamp integer → bigint (Y2038)
-- AG-1/FIX-3  evolution_postgres FDW server: query_timeout 30s
-- AG-2/FIX-1  fn_kpi_rollup_refresh: pg_try_advisory_xact_lock
-- AG-2/FIX-2  v_kpi_overview: qualificar _consumer_dlq com schema zapp
--
-- Auditado em 2026-09-02 pelos Agentes AG-1 e AG-2 (PLANO-100 exaustivo).
-- Corrigido em 2026-09-02 pela auditoria P100-SQL-QUALITY:
--   F-01 CRÍTICO: ALTER TABLE movido para fora do corpo PL/pgSQL (evita ACCESS EXCLUSIVE
--                 no meio da transação da função).
--   F-02 ALTO:    Guard de existência do servidor antes do DO block (evita falha em
--                 pg_options_to_table(NULL) quando evolution_postgres não existe).
--   F-03 ALTO:    ALTER FOREIGN TABLE com IF EXISTS (idempotência).
--   F-04 ALTO:    Bloco BEGIN/EXCEPTION ao redor da query FDW (garante alerta mesmo
--                 quando o pipeline está completamente down).
--   F-07 BAIXO:   Rollback completo para todas as DDL e funções.
-- ─────────────────────────────────────────────────────────────────────────────

SET search_path TO evo, zapp, pg_catalog;

-- ─────────────────────────────────────────────────────────────────────────────
-- F-01 FIX: Garantir colunas ANTES de criar a função.
-- ALTER TABLE dentro de PL/pgSQL adquire ACCESS EXCLUSIVE por toda a transação;
-- executar aqui, fora, limita o lock à DDL pura (instantânea).
-- (migration original 20260820093000 tem 8 colunas base; estas são adicionais)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE evo.recon_coverage_daily ADD COLUMN IF NOT EXISTS missing_lid_24h      bigint;
ALTER TABLE evo.recon_coverage_daily ADD COLUMN IF NOT EXISTS missing_bydesign_24h bigint;


-- ─────────────────────────────────────────────────────────────────────────────
-- AG-1/FIX-2: fdw_evolution_message — messageTimestamp integer → bigint
-- Risco Y2038: int4 satura em 2038-01-19 (max 2147483647).
-- F-03 FIX: IF EXISTS para idempotência (não falha se FDW table não existir).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER FOREIGN TABLE IF EXISTS evo.fdw_evolution_message
  ALTER COLUMN "messageTimestamp" TYPE bigint;


-- ─────────────────────────────────────────────────────────────────────────────
-- AG-1/FIX-1: fn_recon_coverage_snapshot — alerta quando v_src=0
-- Bug original: quando FDW retorna 0 mensagens, v_cov=NULL e o IF final
-- nunca dispara — pipeline pode ficar parado sem nenhum alerta.
-- F-04 FIX: bloco BEGIN/EXCEPTION ao redor das queries FDW para capturar
-- fdw_error / connection_exception e emitir alerta mesmo com pipeline down.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_recon_coverage_snapshot()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'evo', 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_src      bigint;
  v_bydesign bigint;
  v_missing  bigint;
  v_lid      bigint;
  v_mir      bigint;
  v_cov      numeric;
  v_last     timestamptz;
BEGIN
  -- F-04: bloco protegido — captura falha de conexão FDW
  BEGIN
    WITH src AS (
      SELECT f.key->>'id' AS mid, f.key->>'remoteJid' AS rjid,
             CASE WHEN jsonb_typeof(f.message)='object'
                  THEN (SELECT k FROM jsonb_object_keys(f.message) k LIMIT 1)
             END AS fkey
      FROM evo.fdw_evolution_message f
      WHERE to_timestamp(f."messageTimestamp") > now() - interval '24 hours'
        AND f.key->>'fromMe' = 'false'
        AND f.key->>'remoteJid' NOT LIKE '%@g.us'
        AND f.key->>'remoteJid' <> 'status@broadcast'
    ), cls AS (
      SELECT s.mid, s.rjid,
             (s.fkey IS NULL OR s.fkey IN (
               'reactionMessage','protocolMessage','messageContextInfo',
               'pollUpdateMessage','mediaUrl','senderKeyDistributionMessage','editedMessage'
             )) AS bydesign,
             (m.message_id IS NOT NULL) AS no_espelho
      FROM src s
      LEFT JOIN evo.evolution_messages_wpp2 m
             ON m.message_id = s.mid AND m.instance_name = 'wpp2'
    )
    SELECT count(*) FILTER (WHERE NOT bydesign),
           count(*) FILTER (WHERE bydesign),
           count(*) FILTER (WHERE NOT bydesign AND NOT no_espelho),
           count(*) FILTER (WHERE NOT bydesign AND NOT no_espelho AND rjid LIKE '%@lid')
      INTO v_src, v_bydesign, v_missing, v_lid
    FROM cls;

    SELECT count(DISTINCT m.message_id) INTO v_mir
    FROM evo.evolution_messages_wpp2 m
    WHERE m.wa_timestamp > now() - interval '24 hours';

  EXCEPTION
    WHEN fdw_error OR connection_exception OR query_canceled THEN
      -- Pipeline completamente down: FDW inacessível — emite alerta crítico e sai.
      PERFORM zapp.rpc_boundary_raise_alert(
        'recon_coverage',
        'critical',
        'Falha de conexão FDW — pipeline WhatsApp inacessível.',
        'exception=' || SQLERRM,
        jsonb_build_object(
          'sqlerrm',  SQLERRM,
          'sqlstate', SQLSTATE,
          'etapa',    'p100-audit-fix04-fdw-exception'
        ),
        '01:00:00'::interval
      );
      RAISE WARNING 'recon-coverage-fdw-exception sqlerrm=% sqlstate=%', SQLERRM, SQLSTATE;
      RETURN;
  END;

  v_cov := CASE WHEN v_src > 0 THEN round(100.0 * (v_src - v_missing) / v_src, 2) END;
  SELECT max(created_at) INTO v_last FROM evo.evolution_messages_wpp2;

  -- Nota F-01: INSERT direto — ALTER TABLE já foi feito acima, fora da função.
  INSERT INTO evo.recon_coverage_daily AS d
    (snapshot_date, coverage_pct, msgs_source_24h, msgs_mirror_24h, missing_real_24h,
     missing_lid_24h, missing_bydesign_24h, last_ingest_at, source, captured_at)
  VALUES (current_date, v_cov, v_src, v_mir, v_missing, v_lid, v_bydesign, v_last,
          'fdw-setdiff-24h-v2-direto-conteudo', now())
  ON CONFLICT (snapshot_date) DO UPDATE
    SET coverage_pct         = EXCLUDED.coverage_pct,
        msgs_source_24h      = EXCLUDED.msgs_source_24h,
        msgs_mirror_24h      = EXCLUDED.msgs_mirror_24h,
        missing_real_24h     = EXCLUDED.missing_real_24h,
        missing_lid_24h      = EXCLUDED.missing_lid_24h,
        missing_bydesign_24h = EXCLUDED.missing_bydesign_24h,
        last_ingest_at       = EXCLUDED.last_ingest_at,
        source               = EXCLUDED.source,
        captured_at          = now();

  -- Alerta explícito quando fonte FDW está vazia E não há mensagens bydesign
  -- (v_src=0 com v_bydesign>0 = todas as mensagens são bydesign, FDW está ok)
  IF v_src = 0 AND v_bydesign = 0 THEN
    PERFORM zapp.rpc_boundary_raise_alert(
      'recon_coverage',
      'critical',
      'Fonte FDW vazia — zero mensagens nas últimas 24h. Pipeline WhatsApp possivelmente parado.',
      'source_24h=0 mirror_24h=' || v_mir ||
        ' last_ingest=' || coalesce(v_last::text, 'NUNCA'),
      jsonb_build_object(
        'source_24h',    0,
        'mirror_24h',    v_mir,
        'last_ingest_at', v_last,
        'etapa',         'p100-audit-fix01-v-src-zero'
      ),
      '01:00:00'::interval
    );
    RAISE WARNING 'recon-coverage-alert SOURCE_VAZIA mirror=% last=%', v_mir, v_last;
  END IF;

  IF v_cov IS NOT NULL AND v_cov < 99 THEN
    PERFORM zapp.rpc_boundary_raise_alert(
      'recon_coverage', 'warning', 'Cobertura espelho evo abaixo de 99%',
      'coverage=' || coalesce(v_cov::text,'?') || '% faltantes_reais=' ||
        v_missing || ' (lid=' || v_lid || ') fonte24h=' || v_src,
      jsonb_build_object(
        'coverage_pct', v_cov, 'missing', v_missing, 'missing_lid', v_lid,
        'bydesign', v_bydesign, 'source_24h', v_src, 'etapa', 'p100-e19-v2'
      ),
      '06:00:00'::interval
    );
    RAISE WARNING 'recon-coverage-alert coverage=% faltantes=% (lid=%)', v_cov, v_missing, v_lid;
  END IF;
END;
$function$;

COMMENT ON FUNCTION evo.fn_recon_coverage_snapshot() IS
  '[P100-e19-v2] Snapshot de cobertura FDW↔espelho — cron recon-coverage-daily (30 4 * * *). '
  'FIX P100-AUDIT-FIX01 (2026-09-02): alerta crítico quando v_src=0 (fonte FDW vazia). '
  'FIX P100-AUDIT-FIX04 (2026-09-02): bloco EXCEPTION captura fdw_error/connection_exception.';


-- ─────────────────────────────────────────────────────────────────────────────
-- AG-1/FIX-3: FDW server evolution_postgres — adicionar query_timeout 30s
-- Previne que queries FDW lentas bloqueem slot de conexão indefinidamente.
-- F-02 FIX: guard de existência do servidor antes de qualquer operação
-- (pg_options_to_table(NULL) lançaria NullValueNotAllowed sem esse guard).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- F-02: verifica existência antes de acessar srvoptions
  IF NOT EXISTS (SELECT 1 FROM pg_foreign_server WHERE srvname = 'evolution_postgres') THEN
    RAISE WARNING 'FDW server evolution_postgres não encontrado — pulando configuração de query_timeout. '
                  'Verifique se o FDW está instalado no ambiente alvo.';
    RETURN;
  END IF;

  -- Idempotente: SET se a opção já existir, ADD caso contrário.
  IF EXISTS (
    SELECT 1 FROM pg_options_to_table(
      (SELECT srvoptions FROM pg_foreign_server WHERE srvname = 'evolution_postgres')
    ) WHERE option_name = 'query_timeout'
  ) THEN
    ALTER SERVER evolution_postgres OPTIONS (SET query_timeout '30000');
  ELSE
    ALTER SERVER evolution_postgres OPTIONS (ADD query_timeout '30000');
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- AG-2/FIX-1: fn_kpi_rollup_refresh — serialização com advisory lock
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_kpi_rollup_refresh()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'evo', 'zapp', 'pg_catalog'
AS $function$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('evo.fn_kpi_rollup_refresh')) THEN
    RETURN;
  END IF;

  INSERT INTO evo.kpi_rollup_24h (
    snapshot_at, msgs_1h, msgs_24h, last_ingest_at,
    dedup_failures_24h, dedup_tracked_rows,
    webhook_latency_avg_ms_24h, webhook_latency_p95_ms_24h, webhook_events_24h,
    consumer_drop_total, pct_401_24h, ipwatch_hits_24h
  )
  SELECT now(),
    (SELECT count(*) FROM evo.evolution_messages WHERE created_at >= now()-interval '1 hour'),
    (SELECT count(*) FROM evo.evolution_messages WHERE created_at >= now()-interval '24 hours'),
    (SELECT max(created_at) FROM evo.evolution_messages),
    (SELECT count(*) FROM evo.v_dedup_failures),
    (SELECT count(*) FROM zapp.webhook_event_dedup),
    a.avg_ms, a.p95_ms, a.n_24h,
    (SELECT coalesce(sum(mx),0)
       FROM (SELECT max("drop") AS mx
             FROM evo.evolution_rabbit_consumer_stats
             WHERE collected_at > now()-interval '30 minutes'
             GROUP BY replica) z),
    (SELECT coalesce(sum(count),0)::numeric
       FROM evo.evolution_traefik_401_stats
       WHERE collected_at > now()-interval '24 hours'),
    (SELECT count(DISTINCT client_host)
       FROM evo.evolution_traefik_401_stats
       WHERE collected_at > now()-interval '24 hours')
  FROM (
    SELECT round(avg(duration_ms) FILTER (WHERE duration_ms IS NOT NULL),1) AS avg_ms,
           round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms::float8)::numeric,1) AS p95_ms,
           count(*) AS n_24h
    FROM zapp.webhook_audit_log
    WHERE created_at >= now()-interval '24 hours'
  ) a;

  DELETE FROM evo.kpi_rollup_24h WHERE snapshot_at < now() - interval '48 hours';
END;
$function$;

COMMENT ON FUNCTION evo.fn_kpi_rollup_refresh() IS
  '[P100] KPI rollup 24h — cron evo-kpi-rollup-5m (*/5). '
  'FIX P100-AUDIT-FIX01 (2026-09-02): advisory lock para serialização.';


-- ─────────────────────────────────────────────────────────────────────────────
-- AG-2/FIX-2: v_kpi_overview — qualificar _consumer_dlq com schema zapp
-- Com security_invoker=true, roles sem zapp no search_path falhavam.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW evo.v_kpi_overview
  WITH (security_invoker = true)
AS
WITH probe AS (
  SELECT l.checked_at, l.pipeline_status, l.gap_inbound_min
  FROM evo.evolution_pipeline_health_log l
  WHERE l.notes LIKE 'probe-15min%'
  ORDER BY l.checked_at DESC LIMIT 1
), recon AS (
  SELECT d.coverage_pct, d.missing_real_24h, d.missing_lid_24h, d.snapshot_date
  FROM evo.recon_coverage_daily d
  ORDER BY d.snapshot_date DESC LIMIT 1
), roll AS (
  SELECT k.snapshot_at, k.msgs_1h, k.msgs_24h, k.last_ingest_at,
         k.dedup_failures_24h, k.dedup_tracked_rows,
         k.webhook_latency_avg_ms_24h, k.webhook_latency_p95_ms_24h,
         k.webhook_events_24h, k.consumer_drop_total,
         k.pct_401_24h, k.ipwatch_hits_24h
  FROM evo.kpi_rollup_24h k
  ORDER BY k.snapshot_at DESC LIMIT 1
), rmq AS (
  SELECT sum(h.messages) AS backlog, max(h.captured_at) AS captured_at
  FROM evo.rabbitmq_backlog_history h
  WHERE h.source = 'rabbitmq-mgmt-api'
    AND h.captured_at = (
      SELECT max(h2.captured_at) FROM evo.rabbitmq_backlog_history h2
      WHERE h2.source = 'rabbitmq-mgmt-api'
    )
), dlq AS (
  SELECT
    (SELECT count(*) FROM zapp.evolution_webhook_dlq
      WHERE status = 'pending') AS dlq_evo_pending,
    (SELECT count(*) FROM zapp._consumer_dlq
      WHERE status = ANY(ARRAY['pending','error','failed'])) AS dlq_consumer_open
)
SELECT
  now()                                          AS checked_at,
  p.gap_inbound_min                              AS gap_sync_min,
  p.pipeline_status                              AS gap_sync_status,
  p.checked_at                                   AS gap_sync_checked_at,
  r.coverage_pct                                 AS mirror_msg_coverage_pct,
  r.snapshot_date                                AS mirror_coverage_checked_at,
  roll.last_ingest_at,
  roll.msgs_1h,
  roll.msgs_24h,
  round(roll.msgs_24h::numeric / 24::numeric, 1) AS msgs_per_hour_avg_24h,
  roll.dedup_failures_24h,
  roll.dedup_tracked_rows,
  roll.webhook_latency_avg_ms_24h,
  roll.webhook_latency_p95_ms_24h,
  roll.webhook_events_24h,
  roll.pct_401_24h,
  roll.ipwatch_hits_24h,
  q.dlq_evo_pending,
  q.dlq_consumer_open,
  q.dlq_evo_pending + q.dlq_consumer_open        AS dlq_total_open,
  rmq.backlog                                    AS rabbitmq_backlog_messages,
  roll.consumer_drop_total::numeric              AS consumer_drop_total,
  'FONTES v3 (P100 20/08): kpi_rollup_24h; coverage recon_coverage_daily v2; '
  'FIX P100-AUDIT-FIX01: _consumer_dlq → zapp._consumer_dlq.'::text AS notas,
  r.missing_real_24h,
  r.missing_lid_24h,
  roll.snapshot_at                               AS rollup_at,
  rmq.captured_at                                AS backlog_captured_at
FROM (SELECT 1) one
LEFT JOIN probe p ON true
LEFT JOIN recon r ON true
LEFT JOIN roll ON true
LEFT JOIN rmq ON true
CROSS JOIN dlq q;


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK COMPLETO (F-07 FIX: inclui reversão de funções e view)
--
-- Executar na ordem inversa das operações acima:
--
-- 1. Restaurar view e funções (versões anteriores via evolution-stack git):
--    -- git checkout <commit-anterior> -- supabase/functions/_shared/...
--    -- ou restaurar via psql com o corpo das funções antes deste patch
--
-- 2. Reverter ALTER SERVER (query_timeout):
--    ALTER SERVER evolution_postgres OPTIONS (DROP query_timeout);
--
-- 3. Reverter tipo de coluna FDW (bigint → integer):
--    ALTER FOREIGN TABLE IF EXISTS evo.fdw_evolution_message
--      ALTER COLUMN "messageTimestamp" TYPE integer;
--
-- 4. Reverter colunas adicionadas (somente se vazias / sem dados críticos):
--    ALTER TABLE evo.recon_coverage_daily DROP COLUMN IF EXISTS missing_lid_24h;
--    ALTER TABLE evo.recon_coverage_daily DROP COLUMN IF EXISTS missing_bydesign_24h;
--
-- ATENÇÃO: passos 2–4 são DDL reversíveis. O passo 1 (funções/view) requer
-- o corpo original em mãos — não há DROP seguro pois as funções existiam antes
-- deste patch. Sempre restaurar via código-fonte versionado.
-- ─────────────────────────────────────────────────────────────────────────────
