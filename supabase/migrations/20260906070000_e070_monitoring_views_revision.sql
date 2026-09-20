-- E070: Revisão das views de monitoring — v_db_health_overview enriquecida
-- Adiciona: idade de backup WAL, contagem de FDW, crons de paridade, resumo de alertas críticos.
-- Ref: docs/plano-evolution-2026-09/PLANO_100_ETAPAS.md#E070

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. v_db_health_overview — versão enriquecida
-- ─────────────────────────────────────────────────────────────────────────────
-- Correção 2026-09-17 (auditoria Local×GitHub×DB): a view existente em produção
-- tem layout de colunas diferente (coluna "coletado_em" em posição intermediária)
-- e o CREATE OR REPLACE falhava com "cannot change name of view column
-- 'coletado_em' to 'ultimo_wal_arquivado_em'" (run #77, linha 61). O PostgreSQL
-- não permite renomear/reordenar colunas via CREATE OR REPLACE VIEW. Como não há
-- dependentes no repo (verificado) e é view interna de monitoring (consumo via
-- owner/funções SECURITY DEFINER), recriamos com DROP IF EXISTS + CREATE.
DROP VIEW IF EXISTS monitoring.v_db_health_overview;

CREATE VIEW monitoring.v_db_health_overview AS
SELECT
  -- ── Tamanho e objetos ──────────────────────────────────────────────────────
  pg_size_pretty(pg_database_size(current_database()))                    AS tamanho_total,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE')         AS tabelas_public,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'evo')                                           AS objetos_evo,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'zapp')                                          AS objetos_zapp,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'monitoring')                                    AS objetos_monitoring,

  -- ── Cron e funções ────────────────────────────────────────────────────────
  (SELECT count(*) FROM cron.job WHERE active = true)                    AS cron_jobs_ativos,
  (SELECT count(*) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public')                                           AS total_funcoes,

  -- ── Changelog de melhorias ───────────────────────────────────────────────
  (SELECT count(*) FROM architecture_changelog)                          AS melhorias_aplicadas,

  -- ── Backup WAL (degrada para NULL se WAL archiving não configurado) ───────
  (SELECT last_archived_time FROM pg_stat_archiver)                      AS ultimo_wal_arquivado_em,
  round(
    EXTRACT(EPOCH FROM (
      now() - (SELECT last_archived_time FROM pg_stat_archiver)
    )) / 3600.0,
    1
  )                                                                       AS horas_desde_ultimo_backup,

  -- ── FDW (Foreign Data Wrappers) ───────────────────────────────────────────
  (SELECT count(*) FROM pg_foreign_server)                               AS fdw_servidores,

  -- ── Crons de paridade/sentinel ativos ─────────────────────────────────────
  (SELECT count(*) FROM cron.job
    WHERE active = true
      AND (jobname LIKE '%fdw%'
        OR jobname LIKE '%reconcile%'
        OR jobname LIKE '%sentinel%'
        OR jobname LIKE '%paridade%'))                                    AS crons_paridade_ativos,

  -- ── Resumo de alertas críticos abertos ────────────────────────────────────
  (SELECT count(*) FROM zapp.evolution_alerts
    WHERE severity IN ('critical', 'high')
      AND resolved_at IS NULL)                                            AS alertas_criticos_altos_abertos,
  (SELECT count(*) FROM zapp.evolution_alerts
    WHERE severity = 'critical'
      AND resolved_at IS NULL)                                            AS alertas_criticos_abertos,
  (SELECT max(created_at) FROM zapp.evolution_alerts
    WHERE severity IN ('critical', 'high')
      AND resolved_at IS NULL)                                            AS ultimo_alerta_critico_em,

  now()                                                                   AS coletado_em;

COMMENT ON VIEW monitoring.v_db_health_overview IS
  'E070: Visão geral de saúde do banco — tamanho, objetos, crons, backup WAL, FDW, alertas críticos. Atualizado por E070 (2026-09-06).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Verificação de sanidade — confirmar novas colunas presentes
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_row  monitoring.v_db_health_overview%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM monitoring.v_db_health_overview LIMIT 1;

  IF v_row.fdw_servidores IS NULL AND
     (SELECT count(*) FROM pg_foreign_server) > 0 THEN
    RAISE EXCEPTION 'E070: fdw_servidores retornou NULL mas pg_foreign_server tem linhas';
  END IF;

  IF v_row.alertas_criticos_altos_abertos IS NULL THEN
    RAISE EXCEPTION 'E070: alertas_criticos_altos_abertos retornou NULL — verificar acesso a zapp.evolution_alerts';
  END IF;

  RAISE NOTICE 'E070: v_db_health_overview validada — backup=% | fdw_servidores=% | alertas_abertos=%',
    v_row.ultimo_wal_arquivado_em,
    v_row.fdw_servidores,
    v_row.alertas_criticos_altos_abertos;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Registro em schema_migrations (workaround self-hosted)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES (
  '20260906070000',
  'e070_monitoring_views_revision'
)
ON CONFLICT (version) DO NOTHING;
