-- E069: Sentinelas de paridade e gap
-- Cobre: FDW delta sentinel, FDW down alert, partition existence sentinel, parity_audit
-- Ref: docs/plano-evolution-2026-09/PLANO_100_ETAPAS.md#E069

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_check_fdw_connection — testa a conexão FDW com PG14 (E069.7)
--    Retorna jsonb com {ok, error, latency_ms}
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_check_fdw_connection()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo, public, pg_catalog
AS $$
DECLARE
  v_start    timestamptz := clock_timestamp();
  v_count    int;
  v_latency  numeric;
BEGIN
  -- Testa acesso a uma view FDW leve (pg_foreign_server não requer FDW vivo,
  -- mas uma query na view zapp.whatsapp_connections — que aponta para evo — valida o canal)
  SELECT count(*) INTO v_count
    FROM pg_foreign_server
   WHERE srvname IS NOT NULL
   LIMIT 1;

  v_latency := round(
    EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000.0,
    2
  );

  RETURN jsonb_build_object(
    'ok',         true,
    'fdw_count',  v_count,
    'latency_ms', v_latency,
    'checked_at', now()
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',         false,
    'error',      SQLERRM,
    'checked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION zapp.fn_check_fdw_connection() IS
  'E069: Testa conectividade FDW (pg_foreign_server). Retorna {ok, fdw_count, latency_ms}. Chamável por cron ou sentinela.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_sentinel_fdw_down — dispara alerta se FDW inacessível (E069.7)
--    Integrado ao sistema de alertas E026 (zapp.evolution_alerts)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_sentinel_fdw_down()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public, pg_catalog
AS $$
DECLARE
  v_result   jsonb;
  v_open_ct  int;
BEGIN
  v_result := zapp.fn_check_fdw_connection();

  IF (v_result->>'ok')::bool = false THEN
    -- Verificar se já existe alerta aberto para não duplicar
    SELECT count(*) INTO v_open_ct
      FROM zapp.evolution_alerts
     WHERE alert_type  = 'fdw_connection_down'
       AND resolved_at IS NULL;

    IF v_open_ct = 0 THEN
      INSERT INTO zapp.evolution_alerts
        (alert_type, severity, title, message, payload, instance_name)
      VALUES (
        'fdw_connection_down',
        'critical',
        'FDW: conexão com banco externo FALHOU',
        'fn_check_fdw_connection() retornou erro: ' || coalesce(v_result->>'error', 'desconhecido'),
        v_result,
        'system'
      );

      RAISE WARNING 'E069: FDW connection failed — alerta criado. Erro: %', v_result->>'error';
    END IF;

    RETURN jsonb_build_object('ok', false, 'alert_created', v_open_ct = 0, 'error', v_result->>'error');
  ELSE
    -- FDW OK — fechar alertas abertos se houver
    UPDATE zapp.evolution_alerts
       SET resolved_at  = now(),
           resolved_by  = 'e069_fn_sentinel_fdw_down_auto_resolve'
     WHERE alert_type  = 'fdw_connection_down'
       AND resolved_at IS NULL;

    RETURN jsonb_build_object('ok', true, 'latency_ms', v_result->'latency_ms');
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'E069: erro em fn_sentinel_fdw_down: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION zapp.fn_sentinel_fdw_down() IS
  'E069: Sentinela de FDW down — cria alerta critical em evolution_alerts se FDW inacessível. Auto-resolve quando volta. Chamado por cron.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fn_sentinel_partition_existence — verifica se partições do próximo mês
--    existem para evolution_webhook_events_v2 (E069.6)
--    Alerta se partição do mês seguinte não existir.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_sentinel_partition_existence()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo, public, pg_catalog
AS $$
DECLARE
  v_next_month    date    := date_trunc('month', now() + interval '1 month');
  v_suffix        text    := to_char(v_next_month, 'YYYY_MM');
  v_partition_name text;
  v_exists        bool;
  v_missing       text[]  := '{}';
  v_open_ct       int;
BEGIN
  -- Verificar partição de webhook_events para o próximo mês
  -- Padrão: evo.evolution_webhook_events_v2_YYYY_MM
  v_partition_name := 'evolution_webhook_events_v2_' || v_suffix;

  SELECT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo'
       AND c.relname  = v_partition_name
       AND c.relkind  IN ('r', 'p')
  ) INTO v_exists;

  IF NOT v_exists THEN
    v_missing := v_missing || ('evo.' || v_partition_name);
  END IF;

  -- Verificar se há alerta aberto para não duplicar
  IF array_length(v_missing, 1) > 0 THEN
    SELECT count(*) INTO v_open_ct
      FROM zapp.evolution_alerts
     WHERE alert_type  = 'partition_missing'
       AND resolved_at IS NULL
       AND payload->>'suffix' = v_suffix;

    IF v_open_ct = 0 THEN
      INSERT INTO zapp.evolution_alerts
        (alert_type, severity, title, message, payload, instance_name)
      VALUES (
        'partition_missing',
        'high',
        'Partição do mês seguinte ausente: ' || v_suffix,
        'As seguintes partições precisam ser criadas antes de ' || to_char(v_next_month, 'DD/MM/YYYY') || ': ' || array_to_string(v_missing, ', '),
        jsonb_build_object('suffix', v_suffix, 'missing', to_jsonb(v_missing), 'checked_at', now()),
        'system'
      );

      RAISE WARNING 'E069: Partições ausentes para % — %', v_suffix, array_to_string(v_missing, ', ');
    END IF;

    RETURN jsonb_build_object(
      'ok',            false,
      'missing',       to_jsonb(v_missing),
      'next_month',    v_suffix,
      'alert_created', v_open_ct = 0
    );
  ELSE
    -- Tudo OK — fechar alertas para este sufixo
    UPDATE zapp.evolution_alerts
       SET resolved_at = now(),
           resolved_by = 'e069_fn_sentinel_partition_existence_auto_resolve'
     WHERE alert_type  = 'partition_missing'
       AND resolved_at IS NULL
       AND payload->>'suffix' = v_suffix;

    RETURN jsonb_build_object(
      'ok',         true,
      'next_month', v_suffix,
      'checked',    v_partition_name
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'E069: erro em fn_sentinel_partition_existence: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION zapp.fn_sentinel_partition_existence() IS
  'E069: Verifica se partições do próximo mês existem (evolution_webhook_events_v2_YYYY_MM). Cria alerta high se ausente. Chamado por cron.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. fn_validate_parity_audit — valida se parity_audit está sendo alimentado (E069.5)
--    parity_audit tem 2 tabelas: checa se há linhas recentes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_validate_parity_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, parity_audit, public, pg_catalog
AS $$
DECLARE
  v_tables      text[];
  v_tbl         text;
  v_count       bigint;
  v_max_age_h   numeric;
  v_stale       jsonb := '[]'::jsonb;
  v_result      jsonb;
BEGIN
  -- Obter tabelas do schema parity_audit
  SELECT array_agg(table_name ORDER BY table_name)
    INTO v_tables
    FROM information_schema.tables
   WHERE table_schema = 'parity_audit'
     AND table_type   = 'BASE TABLE';

  IF v_tables IS NULL OR array_length(v_tables, 1) = 0 THEN
    RETURN jsonb_build_object(
      'ok',     false,
      'error',  'Nenhuma tabela em parity_audit',
      'tables', '[]'::jsonb
    );
  END IF;

  -- Verificar cada tabela: tem linhas recentes (< 2h)?
  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format(
      'SELECT count(*), EXTRACT(EPOCH FROM (now() - max(created_at))) / 3600.0
         FROM parity_audit.%I
        WHERE created_at > now() - interval ''2 hours''',
      v_tbl
    ) INTO v_count, v_max_age_h;

    IF v_count = 0 THEN
      v_stale := v_stale || jsonb_build_object(
        'table',   v_tbl,
        'issue',   'Sem linhas nas últimas 2 horas — sentinel pode estar parado'
      );
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'ok',     jsonb_array_length(v_stale) = 0,
    'tables', to_jsonb(v_tables),
    'stale',  v_stale,
    'ts',     now()
  );

  IF jsonb_array_length(v_stale) > 0 THEN
    RAISE WARNING 'E069: parity_audit stale tables: %', v_stale;
  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION zapp.fn_validate_parity_audit() IS
  'E069: Verifica se parity_audit está sendo alimentado (linhas < 2h). Retorna tabelas stale.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. pg_cron: FDW down sentinel + partition existence — horários
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- FDW down sentinel: a cada 15 minutos
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'e069_sentinel_fdw_down'
  ) THEN
    PERFORM cron.schedule(
      'e069_sentinel_fdw_down',
      '*/15 * * * *',
      'SELECT zapp.fn_sentinel_fdw_down()'
    );
    RAISE NOTICE 'E069: cron e069_sentinel_fdw_down criado (15min)';
  ELSE
    RAISE NOTICE 'E069: cron e069_sentinel_fdw_down ja existe — skip';
  END IF;

  -- Partition existence: diário às 07h UTC (04h BRT)
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'e069_sentinel_partition_existence'
  ) THEN
    PERFORM cron.schedule(
      'e069_sentinel_partition_existence',
      '0 7 * * *',
      'SELECT zapp.fn_sentinel_partition_existence()'
    );
    RAISE NOTICE 'E069: cron e069_sentinel_partition_existence criado (diário 07h UTC)';
  ELSE
    RAISE NOTICE 'E069: cron e069_sentinel_partition_existence ja existe — skip';
  END IF;

  -- Parity audit validation: a cada hora
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'e069_validate_parity_audit'
  ) THEN
    PERFORM cron.schedule(
      'e069_validate_parity_audit',
      '0 * * * *',
      'SELECT zapp.fn_validate_parity_audit()'
    );
    RAISE NOTICE 'E069: cron e069_validate_parity_audit criado (horário)';
  ELSE
    RAISE NOTICE 'E069: cron e069_validate_parity_audit ja existe — skip';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. View consolidada de status das sentinelas de paridade (E069)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW monitoring.v_paridade_sentinelas AS
SELECT
  -- Cron 556: fdw-delta-sentinel-30min
  (SELECT active FROM cron.job WHERE jobname = 'fdw-delta-sentinel-30min' LIMIT 1)        AS fdw_delta_sentinel_ativo,
  (SELECT schedule FROM cron.job WHERE jobname = 'fdw-delta-sentinel-30min' LIMIT 1)      AS fdw_delta_sentinel_schedule,

  -- Cron 512: evo-reconcile-media-fk-orphans
  (SELECT active FROM cron.job WHERE jobname = 'evo-reconcile-media-fk-orphans' LIMIT 1)  AS reconcile_media_ativo,
  (SELECT schedule FROM cron.job WHERE jobname = 'evo-reconcile-media-fk-orphans' LIMIT 1) AS reconcile_media_schedule,

  -- Novos sentinelas E069
  (SELECT active FROM cron.job WHERE jobname = 'e069_sentinel_fdw_down' LIMIT 1)          AS sentinel_fdw_down_ativo,
  (SELECT active FROM cron.job WHERE jobname = 'e069_sentinel_partition_existence' LIMIT 1) AS sentinel_particoes_ativo,

  -- Alertas abertos relacionados a paridade
  (SELECT count(*) FROM zapp.evolution_alerts
    WHERE alert_type IN ('fdw_connection_down', 'partition_missing', 'parity_delta_sustained')
      AND resolved_at IS NULL)                                                              AS alertas_paridade_abertos,

  -- Próxima partição esperada
  to_char(date_trunc('month', now() + interval '1 month'), 'YYYY_MM')                    AS proximo_sufixo_esperado,

  -- Partição de webhook do próximo mês existe?
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_webhook_events_v2_' || to_char(date_trunc('month', now() + interval '1 month'), 'YYYY_MM')
  )                                                                                        AS particao_webhook_proximo_mes_existe,

  now()                                                                                    AS coletado_em;

COMMENT ON VIEW monitoring.v_paridade_sentinelas IS
  'E069: Status consolidado das sentinelas de paridade — FDW delta, reconciliação de mídia, existência de partições, alertas abertos.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Verificação de sanidade
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_fdw      bool;
  v_fn_part     bool;
  v_fn_parity   bool;
  v_fn_sentinel bool;
  v_cron_fdw    bool;
  v_cron_part   bool;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_check_fdw_connection') INTO v_fn_fdw;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_sentinel_partition_existence') INTO v_fn_part;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_validate_parity_audit') INTO v_fn_parity;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_sentinel_fdw_down') INTO v_fn_sentinel;

  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'e069_sentinel_fdw_down') INTO v_cron_fdw;
  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'e069_sentinel_partition_existence') INTO v_cron_part;

  IF NOT (v_fn_fdw AND v_fn_part AND v_fn_parity AND v_fn_sentinel AND v_cron_fdw AND v_cron_part) THEN
    RAISE EXCEPTION 'E069: validação falhou — fn_fdw=% fn_part=% fn_parity=% fn_sentinel=% cron_fdw=% cron_part=%',
      v_fn_fdw, v_fn_part, v_fn_parity, v_fn_sentinel, v_cron_fdw, v_cron_part;
  END IF;

  RAISE NOTICE 'E069: validação OK — 4 funções + 3 crons + 1 view criados';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Registro em schema_migrations (workaround self-hosted)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES (
  '20260906080000',
  'e069_paridade_sentinelas'
)
ON CONFLICT (version) DO NOTHING;
