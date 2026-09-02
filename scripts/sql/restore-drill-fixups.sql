-- ═══════════════════════════════════════════════════════════════════════════
-- PLANO-100 P1 — fixups pós-restore para drill limpo (0 erros ignorados)
-- ═══════════════════════════════════════════════════════════════════════════
-- Alvo: BANCO DE RESTORE DESCARTÁVEL (restore_drill_YYYYMMDD). NUNCA rodar em
-- produção — §3 apaga linhas de dado (órfãs) para destravar as FKs.
--
-- VALIDADO AO VIVO em 2026-08-24 (drill com dump 09:29, 137 MB):
--   restore bruto: 99 erros → após §0+§3+§4 e replay (§5): 0 erros
--   decomposição dos 99: 93 cascata pg_cron (mesma instância) + 4 FKs órfãs
--   + 2 mv_system_status (subsumida pela cascata).
--
-- Sequência comprovada (ver RESTORE_DRILL.md §3):
--   1. pg_restore -j4 (99 erros conhecidos)
--   2. §0 stubs cron      → destrava views/comments/MV
--   3. §3 limpeza órfãs   → destrava as 4 FKs
--   4. §4 re-add FKs      → prova validação limpa
--   5. §5 replay -L       → reexecuta TUDO que falhou (0 erros)
--   6. sanidade + dropdb
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── §0 Stubs do schema cron (AMBIENTE DE DRILL, mesma instância) ──────────
-- pg_cron SÓ pode ser criado no banco definido em cron.database_name ('postgres').
-- Num drill na mesma instância, CREATE EXTENSION pg_cron falha e arrasta 93
-- objetos (views v_steps_progress/v_ai_catalog/v_cron_health_24h/v_ai_health_
-- summary, v_perf_dashboard, 79 comments, mv_system_status). Os stubs abaixo
-- recebem o COPY dos dados de cron.job e destravam o replay (§5).
-- Em DR real (instância nova), este bloco é desnecessário — a extensão instala
-- normalmente no banco postgres do destino.

CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigint, schedule text, command text, nodename text, nodeport integer,
  database text, username text, active boolean, jobname text);
CREATE TABLE IF NOT EXISTS cron.job_run_details (
  jobid bigint, runid bigint, job_pid integer, database text, username text,
  command text, status text, return_message text,
  start_time timestamptz, end_time timestamptz);

-- ─── §1 (legado) localizar FK evolution_whatsapp_status por constraint ─────
-- Mantido para compatibilidade; a limpeza geral está no §3.

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
    RAISE NOTICE '§1: constraint não encontrada — nada a fazer (ver §3/§4)';
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
-- OBS (2026-08-24): se o replay (§5) rodou, a MV já vem do dump — este bloco
-- é o fallback. WITH NO DATA + REFRESH no final = mesmo estado de produção.

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

-- ─── §3 Órfãos das 4 FKs conhecidas (drill de 2026-08-24, contagens reais) ──
-- Produção TEM esses órfãos AGORA (FKs convalidated — bypass via bulk ops /
-- session_replication_role). No drill: DELETE nos pequenos, NULL no gigante.
-- ⚠ DECISÃO DE DONO pendente p/ PRODUÇÃO (não é escopo do drill):
--    evolution_whatsapp_status.contact_id referencia outro domínio de id
--    (14.780/14.789 linhas órfãs = 99,9% da tabela) — FK provavelmente
--    vestigial; opções: dropar FK via migration ou NULL em massa.

DELETE FROM zapp.conversation_events s
 WHERE s.contact_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM evo.evolution_contacts c WHERE c.id = s.contact_id);

DELETE FROM zapp.contact_intelligence s
 WHERE s.contact_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM evo.evolution_contacts c WHERE c.id = s.contact_id);

DELETE FROM auth.mfa_amr_claims s
 WHERE s.session_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM auth.sessions c WHERE c.id = s.session_id);

UPDATE zapp.evolution_whatsapp_status s
   SET contact_id = NULL
 WHERE s.contact_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM evo.evolution_contacts c WHERE c.id = s.contact_id);

-- ─── §4 Re-adicionar as 4 FKs (prova de validação limpa) ───────────────────
-- Definições conferidas com pg_get_constraintdef da produção em 2026-08-24.

ALTER TABLE zapp.conversation_events
  ADD CONSTRAINT conversation_events_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id) ON DELETE CASCADE;

ALTER TABLE zapp.contact_intelligence
  ADD CONSTRAINT ci_contact_id_fk
  FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE zapp.evolution_whatsapp_status
  ADD CONSTRAINT evolution_whatsapp_status_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES evo.evolution_contacts(id);

ALTER TABLE auth.mfa_amr_claims
  ADD CONSTRAINT mfa_amr_claims_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;

-- ─── §5 Replay das entradas que falharam no restore bruto ──────────────────
-- (executar NO SHELL, não aqui — pg_restore reexecuta exatamente o que falhou)
--
--   pg_restore -l <dump> | grep -E 'v_50_steps_progress|v_ai_catalog|\
--     v_cron_health_24h|v_ai_health_summary|v_perf_dashboard|mv_system_status' \
--     > replay.lst
--   pg_restore -d restore_drill_YYYYMMDD -j2 --no-owner --no-acl \
--     -L replay.lst <dump>
--
-- Resultado em 2026-08-24: EXIT=0, ZERO erros (86 entradas: 6 views,
-- 79 comments, MV + refresh). Restam impossíveis no drill same-instance:
-- CREATE EXTENSION pg_cron + COMMENT ON EXTENSION (2 erros, artefato de
-- ambiente documentado — em DR real não ocorrem).
