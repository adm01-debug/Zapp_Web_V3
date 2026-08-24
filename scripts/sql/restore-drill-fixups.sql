-- ═══════════════════════════════════════════════════════════════════════════
-- PLANO-100 P1 — fixups pós-restore para drill limpo (0 erros ignorados)
-- ═══════════════════════════════════════════════════════════════════════════
-- Alvo: BANCO DE RESTORE DESCARTÁVEL (restore_drill_YYYYMMDD). NUNCA rodar em
-- produção — o passo §1 apaga linha de dado (órfã) para destravar a FK.
--
-- Corrige os 2 erros conhecidos do drill E93 (2026-08-17, 19 erros ignorados):
--   1. FK evolution_whatsapp_status_contact_id_fkey — contact_id órfão
--      (409ebe64-…) sem linha pai em evolution_contacts
--   2. REFRESH zapp.mv_system_status — MV ausente no destino do restore
--
-- Uso (VPS, após pg_restore no banco descartável):
--   psql -h <host> -U postgres -d restore_drill_$(date +%Y%m%d) \
--     -v ON_ERROR_STOP=1 -f scripts/sql/restore-drill-fixups.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── §1 Órfãos da FK evolution_whatsapp_status_contact_id_fkey ─────────────
-- A tabela física pode estar em zapp ou evo (a superfície zapp.* é view em
-- partes). Localizar pela própria constraint deixa o script imune à topologia.

DO $fix_fk$
DECLARE
  v_table text;
  v_schema text;
  v_orphans bigint;
BEGIN
  SELECT n.nspname, c.relname
    INTO v_schema, v_table
  FROM pg_constraint k
  JOIN pg_class c ON c.oid = k.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE k.conname = 'evolution_whatsapp_status_contact_id_fkey'
  LIMIT 1;

  IF v_table IS NULL THEN
    RAISE NOTICE '§1: constraint não encontrada — nada a fazer (dump já limpo?)';
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM %I.%I s
      WHERE s.contact_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM evolution_contacts c WHERE c.id = s.contact_id)',
    v_schema, v_table) INTO v_orphans;

  IF v_orphans = 0 THEN
    RAISE NOTICE '§1: 0 órfãos — FK pode ser reaplicada limpa';
    RETURN;
  END IF;

  -- Sanity: nunca mais que 0,1% da tabela é órfão esperado (erro de janela de
  -- dump, não de corrupção). Se estourar, o drill deve PARAR para investigar.
  IF v_orphans > 15 THEN
    RAISE EXCEPTION '§1: % órfãos (>15) — investigar antes de limpar', v_orphans;
  END IF;

  EXECUTE format(
    'DELETE FROM %I.%I s
      WHERE s.contact_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM evolution_contacts c WHERE c.id = s.contact_id)',
    v_schema, v_table);

  RAISE NOTICE '§1: % órfãos removidos de %.% — FK recriável', v_orphans, v_schema, v_table;
END
$fix_fk$;

-- ─── §2 mv_system_status ausente no destino ────────────────────────────────
-- Definição canônica extraída do snapshot do drift-gate (regen 2026-08-21).
-- WITH NO DATA + REFRESH no final = mesmo estado de produção.

CREATE MATERIALIZED VIEW IF NOT EXISTS zapp.mv_system_status AS
 SELECT now() AS snapshot_at,
    pg_database_size(current_database()) AS db_size_bytes,
    pg_size_pretty(pg_database_size(current_database())) AS db_size,
    ( SELECT count(*) AS count
           FROM information_schema.tables
          WHERE ((tables.table_schema)::name = 'zapp'::name)) AS total_tables,
    ( SELECT count(*) AS count
           FROM pg_stat_activity
          WHERE (pg_stat_activity.state = 'active'::text)) AS active_connections,
    ( SELECT count(*) AS count
           FROM evo.evolution_messages) AS total_messages,
    ( SELECT count(*) AS count
           FROM evo.evolution_contacts
          WHERE (evolution_contacts.deleted_at IS NULL)) AS total_contacts,
    ( SELECT count(*) AS count
           FROM evo.evolution_conversations
          WHERE ((evolution_conversations.status)::text = 'aberta'::text)) AS open_conversations,
    ( SELECT count(*) AS count
           FROM evo.evolution_messages
          WHERE (evolution_messages.created_at > (now() - '24:00:00'::interval))) AS messages_24h,
    ( SELECT count(*) AS count
           FROM zapp.evolution_deals
          WHERE (evolution_deals.deleted_at IS NULL)) AS active_deals,
    ( SELECT COALESCE(sum(evolution_deals.value), (0)::numeric) AS "coalesce"
           FROM zapp.evolution_deals
          WHERE ((evolution_deals.deleted_at IS NULL) AND ((evolution_deals.stage)::text <> ALL ((ARRAY['pedido_finalizado'::character varying, 'perdido'::character varying])::text[])))) AS pipeline_value,
    ( SELECT count(*) AS count
           FROM bpm.bpm_cards
          WHERE (bpm_cards.status = 'active'::zapp.bpm_card_status)) AS active_cards,
    ( SELECT count(*) AS count
           FROM bpm.bpm_flows
          WHERE (bpm_flows.deleted_at IS NULL)) AS total_flows,
    ( SELECT count(*) AS count
           FROM zapp.agents) AS total_agents,
    ( SELECT count(*) AS count
           FROM zapp.agents
          WHERE (agents.status = 'production'::zapp.agent_status)) AS production_agents,
    ( SELECT count(*) AS count
           FROM zapp.integration_registry
          WHERE (integration_registry.status = 'active'::text)) AS total_integrations,
    ( SELECT count(*) AS count
           FROM zapp.integration_registry
          WHERE (integration_registry.health_status = 'healthy'::text)) AS healthy_integrations,
    ( SELECT count(*) AS count
           FROM cron.job
          WHERE job.active) AS cron_jobs,
    ( SELECT count(*) AS count
           FROM pg_trigger
          WHERE (NOT pg_trigger.tgisinternal)) AS triggers
  WITH NO DATA;

REFRESH MATERIALIZED VIEW zapp.mv_system_status;
