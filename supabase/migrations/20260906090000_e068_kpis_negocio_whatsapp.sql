-- E068: KPIs de negócio do canal WhatsApp
-- Validação e enriquecimento de métricas operacionais: tempo de primeira resposta,
-- conversas ativas/dia, mensagens não respondidas >4h, fix do refresh de MV.
-- Ref: docs/plano-evolution-2026-09/PLANO_100_ETAPAS.md#E068

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Função: fn_kpi_tempo_primeira_resposta
--    Calcula o tempo médio entre mensagem inbound e 1ª resposta do atendente.
--    Janela padrão: últimas 24h. Retorna jsonb com p50/p75/p95/média.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_kpi_tempo_primeira_resposta(
  p_instance_name text DEFAULT 'wpp2',
  p_janela_horas  int  DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp, evo, public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'instance_name',   p_instance_name,
    'janela_horas',    p_janela_horas,
    'total_pares',     count(*),
    'media_minutos',   round(avg(diff_min)::numeric, 1),
    'p50_minutos',     round(percentile_cont(0.50) WITHIN GROUP (ORDER BY diff_min)::numeric, 1),
    'p75_minutos',     round(percentile_cont(0.75) WITHIN GROUP (ORDER BY diff_min)::numeric, 1),
    'p95_minutos',     round(percentile_cont(0.95) WITHIN GROUP (ORDER BY diff_min)::numeric, 1),
    'calculado_em',    now()
  )
  INTO v_result
  FROM (
    SELECT
      -- Para cada conversa: diferença em minutos entre 1ª mensagem inbound e 1ª resposta outbound
      EXTRACT(EPOCH FROM (
        min(CASE WHEN m.key_fromme = true THEN m.message_timestamp END) -
        min(CASE WHEN m.key_fromme = false THEN m.message_timestamp END)
      )) / 60.0 AS diff_min
    FROM evo.evolution_messages m
    WHERE m.instance_name = p_instance_name
      AND m.message_timestamp >= now() - (p_janela_horas || ' hours')::interval
      AND m.message_type NOT IN ('reactionMessage', 'protocolMessage')
    GROUP BY m.key_remote_jid
    HAVING
      min(CASE WHEN m.key_fromme = false THEN m.message_timestamp END) IS NOT NULL
      AND min(CASE WHEN m.key_fromme = true  THEN m.message_timestamp END) IS NOT NULL
      AND min(CASE WHEN m.key_fromme = true  THEN m.message_timestamp END) >
          min(CASE WHEN m.key_fromme = false THEN m.message_timestamp END)
  ) sub
  WHERE diff_min IS NOT NULL AND diff_min BETWEEN 0 AND 1440; -- limita a 24h p/ excluir outliers estranhos

  RETURN coalesce(v_result, jsonb_build_object(
    'instance_name', p_instance_name,
    'janela_horas',  p_janela_horas,
    'total_pares',   0,
    'calculado_em',  now(),
    'aviso',         'Sem dados suficientes na janela informada'
  ));

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'calculado_em', now());
END;
$$;

COMMENT ON FUNCTION zapp.fn_kpi_tempo_primeira_resposta(text, int) IS
  'E068: Calcula p50/p75/p95 e média do tempo de primeira resposta (min) para instância e janela dadas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Função: fn_kpi_conversas_ativas
--    Retorna contagem de conversas ativas e novas nas últimas 24h.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_kpi_conversas_ativas(
  p_instance_name text DEFAULT 'wpp2'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp, evo, public, pg_catalog
AS $$
DECLARE
  v_ativas    int;
  v_novas     int;
  v_fechadas  int;
BEGIN
  SELECT
    count(*) FILTER (WHERE status IN ('open', 'pending'))             INTO v_ativas
  FROM evo.evolution_conversations
  WHERE instance_name = p_instance_name;

  SELECT
    count(*) FILTER (WHERE created_at >= now() - interval '24 hours') INTO v_novas
  FROM evo.evolution_conversations
  WHERE instance_name = p_instance_name;

  SELECT
    count(*) FILTER (WHERE status = 'closed'
                       AND updated_at >= now() - interval '24 hours') INTO v_fechadas
  FROM evo.evolution_conversations
  WHERE instance_name = p_instance_name;

  RETURN jsonb_build_object(
    'instance_name',         p_instance_name,
    'conversas_ativas',      coalesce(v_ativas, 0),
    'conversas_novas_24h',   coalesce(v_novas, 0),
    'conversas_fechadas_24h',coalesce(v_fechadas, 0),
    'calculado_em',          now()
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'calculado_em', now());
END;
$$;

COMMENT ON FUNCTION zapp.fn_kpi_conversas_ativas(text) IS
  'E068: Retorna conversas ativas, novas/24h e fechadas/24h para a instância.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Função: fn_kpi_mensagens_nao_respondidas
--    Identifica conversas com última mensagem inbound há >4h sem resposta outbound.
--    Insere alerta em zapp.evolution_alerts se houver backlog critico.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_kpi_mensagens_nao_respondidas(
  p_instance_name  text    DEFAULT 'wpp2',
  p_threshold_horas numeric DEFAULT 4.0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo, public, pg_catalog
AS $$
DECLARE
  v_backlog_ct   int;
  v_open_alert   int;
  v_result       jsonb;
BEGIN
  -- Conversas onde a última mensagem é inbound e tem >p_threshold_horas sem resposta
  SELECT count(*)
  INTO v_backlog_ct
  FROM (
    SELECT m.key_remote_jid
    FROM evo.evolution_messages m
    WHERE m.instance_name = p_instance_name
      AND m.message_timestamp >= now() - interval '7 days'
    GROUP BY m.key_remote_jid
    HAVING
      -- última mensagem é inbound
      (array_agg(m.key_fromme ORDER BY m.message_timestamp DESC))[1] = false
      -- e foi há mais de threshold_horas
      AND max(m.message_timestamp) < now() - (p_threshold_horas || ' hours')::interval
  ) backlog;

  v_result := jsonb_build_object(
    'instance_name',         p_instance_name,
    'threshold_horas',       p_threshold_horas,
    'conversas_sem_resposta', coalesce(v_backlog_ct, 0),
    'calculado_em',          now()
  );

  -- Criar alerta se backlog >= 5 conversas
  IF coalesce(v_backlog_ct, 0) >= 5 THEN
    SELECT count(*) INTO v_open_alert
    FROM zapp.evolution_alerts
    WHERE alert_type = 'backlog_sem_resposta'
      AND resolved_at IS NULL
      AND instance_name = p_instance_name;

    IF v_open_alert = 0 THEN
      INSERT INTO zapp.evolution_alerts
        (alert_type, severity, title, message, instance_name, payload)
      VALUES (
        'backlog_sem_resposta',
        'high',
        'Backlog de mensagens sem resposta — ' || p_instance_name,
        v_backlog_ct::text || ' conversa(s) sem resposta há mais de ' || p_threshold_horas::text || 'h',
        p_instance_name,
        v_result
      );
    END IF;
  ELSE
    -- Auto-resolve se backlog zerou
    UPDATE zapp.evolution_alerts
       SET resolved_at = now(), resolved_by = 'fn_kpi_mensagens_nao_respondidas'
     WHERE alert_type = 'backlog_sem_resposta'
       AND instance_name = p_instance_name
       AND resolved_at IS NULL;
  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'calculado_em', now());
END;
$$;

COMMENT ON FUNCTION zapp.fn_kpi_mensagens_nao_respondidas(text, numeric) IS
  'E068: Detecta backlog de conversas sem resposta >Nh; cria alerta high se >= 5 conversas afetadas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. View: monitoring.v_kpi_negocio_whatsapp
--    Consolida os 3 KPIs em uma view consultável para dashboard.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW monitoring.v_kpi_negocio_whatsapp AS
SELECT
  -- ── Tempo de primeira resposta (wpp2, 24h) ───────────────────────────────
  (SELECT (zapp.fn_kpi_tempo_primeira_resposta('wpp2', 24) ->> 'p50_minutos')::numeric)   AS tpr_p50_min,
  (SELECT (zapp.fn_kpi_tempo_primeira_resposta('wpp2', 24) ->> 'p75_minutos')::numeric)   AS tpr_p75_min,
  (SELECT (zapp.fn_kpi_tempo_primeira_resposta('wpp2', 24) ->> 'media_minutos')::numeric) AS tpr_media_min,

  -- ── Conversas ────────────────────────────────────────────────────────────
  (SELECT (zapp.fn_kpi_conversas_ativas('wpp2') ->> 'conversas_ativas')::int)       AS conversas_ativas,
  (SELECT (zapp.fn_kpi_conversas_ativas('wpp2') ->> 'conversas_novas_24h')::int)    AS conversas_novas_24h,
  (SELECT (zapp.fn_kpi_conversas_ativas('wpp2') ->> 'conversas_fechadas_24h')::int) AS conversas_fechadas_24h,

  -- ── Backlog sem resposta >4h ──────────────────────────────────────────────
  (SELECT (zapp.fn_kpi_mensagens_nao_respondidas('wpp2', 4.0) ->> 'conversas_sem_resposta')::int) AS backlog_sem_resposta_4h,

  -- ── Alertas operacionais abertos ─────────────────────────────────────────
  (SELECT count(*) FROM zapp.evolution_alerts
    WHERE severity IN ('critical', 'high') AND resolved_at IS NULL)                  AS alertas_operacionais_abertos,

  now() AS coletado_em;

COMMENT ON VIEW monitoring.v_kpi_negocio_whatsapp IS
  'E068: KPIs de negócio WhatsApp — TPR p50/p75/média, conversas ativas/novas, backlog sem resposta. Atualizado por E068 (2026-09-06).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fix refresh de materialized view daily_metrics
--    O job 'refresh-daily-metrics' teve falhas porque a MV pode não existir
--    ou o comando estava com nome errado. Criamos uma função wrapper segura.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_refresh_daily_metrics_safe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public, pg_catalog
AS $$
DECLARE
  v_mvs  text[] := ARRAY['mv_daily_kpis', 'mv_agent_performance_daily', 'mv_conversation_metrics_daily'];
  v_mv   text;
  v_exists bool;
  v_refreshed int := 0;
  v_skipped   int := 0;
  v_errors    int := 0;
  v_log       jsonb := '[]'::jsonb;
BEGIN
  FOREACH v_mv IN ARRAY v_mvs LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_matviews
       WHERE schemaname = 'zapp' AND matviewname = v_mv
    ) INTO v_exists;

    IF v_exists THEN
      BEGIN
        EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY zapp.%I', v_mv);
        v_refreshed := v_refreshed + 1;
        v_log := v_log || jsonb_build_object('mv', v_mv, 'status', 'refreshed');
      EXCEPTION WHEN OTHERS THEN
        -- CONCURRENTLY requer índice único; tenta sem CONCURRENTLY
        BEGIN
          EXECUTE format('REFRESH MATERIALIZED VIEW zapp.%I', v_mv);
          v_refreshed := v_refreshed + 1;
          v_log := v_log || jsonb_build_object('mv', v_mv, 'status', 'refreshed_no_concurrent');
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors + 1;
          v_log := v_log || jsonb_build_object('mv', v_mv, 'status', 'error', 'error', SQLERRM);
        END;
      END;
    ELSE
      v_skipped := v_skipped + 1;
      v_log := v_log || jsonb_build_object('mv', v_mv, 'status', 'skipped_not_found');
    END IF;
  END LOOP;

  RAISE NOTICE 'E068 refresh_daily_metrics_safe: refreshed=% skipped=% errors=%', v_refreshed, v_skipped, v_errors;

  RETURN jsonb_build_object(
    'ok',        v_errors = 0,
    'refreshed', v_refreshed,
    'skipped',   v_skipped,
    'errors',    v_errors,
    'log',       v_log,
    'executado_em', now()
  );
END;
$$;

COMMENT ON FUNCTION zapp.fn_refresh_daily_metrics_safe() IS
  'E068: Refresh seguro das MVs daily_metrics — verifica existência antes de executar, tolera ausência de índice UNIQUE.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. pg_cron — registrar/atualizar jobs E068
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Substituir refresh-daily-metrics falho pelo wrapper seguro
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-daily-metrics') THEN
    UPDATE cron.job
       SET command = 'SELECT zapp.fn_refresh_daily_metrics_safe()',
           active  = true
     WHERE jobname = 'refresh-daily-metrics';
    RAISE NOTICE 'E068: refresh-daily-metrics atualizado para fn_refresh_daily_metrics_safe()';
  ELSE
    PERFORM cron.schedule(
      'refresh-daily-metrics',
      '0 4 * * *',
      'SELECT zapp.fn_refresh_daily_metrics_safe()'
    );
    RAISE NOTICE 'E068: cron refresh-daily-metrics criado (04h UTC diário)';
  END IF;

  -- KPI backlog sem resposta — verificar a cada hora em horário comercial
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'e068_kpi_backlog_sem_resposta') THEN
    PERFORM cron.schedule(
      'e068_kpi_backlog_sem_resposta',
      '0 8-22 * * 1-6',
      'SELECT zapp.fn_kpi_mensagens_nao_respondidas(''wpp2'', 4.0)'
    );
    RAISE NOTICE 'E068: cron e068_kpi_backlog_sem_resposta criado (horário comercial seg-sáb)';
  ELSE
    RAISE NOTICE 'E068: cron e068_kpi_backlog_sem_resposta já existe — skip';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Verificação de sanidade
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_tpr    bool;
  v_fn_conv   bool;
  v_fn_back   bool;
  v_fn_ref    bool;
  v_view      bool;
  v_cron_back bool;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_kpi_tempo_primeira_resposta') INTO v_fn_tpr;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_kpi_conversas_ativas') INTO v_fn_conv;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_kpi_mensagens_nao_respondidas') INTO v_fn_back;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_refresh_daily_metrics_safe') INTO v_fn_ref;

  SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'monitoring' AND viewname = 'v_kpi_negocio_whatsapp') INTO v_view;

  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'e068_kpi_backlog_sem_resposta') INTO v_cron_back;

  IF NOT (v_fn_tpr AND v_fn_conv AND v_fn_back AND v_fn_ref AND v_view AND v_cron_back) THEN
    RAISE EXCEPTION 'E068: validacao falhou — fn_tpr=% fn_conv=% fn_back=% fn_ref=% view=% cron_back=%',
      v_fn_tpr, v_fn_conv, v_fn_back, v_fn_ref, v_view, v_cron_back;
  END IF;

  RAISE NOTICE 'E068: validacao OK — 4 funcoes + view kpi_negocio_whatsapp + cron backlog';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Registro em schema_migrations (workaround self-hosted)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES (
  '20260906090000',
  'e068_kpis_negocio_whatsapp'
)
ON CONFLICT (version) DO NOTHING;
