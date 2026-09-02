-- [PATCH P100-AUDIT-FIX01] Correções da auditoria exaustiva PLANO-100
-- Gerado em 2026-09-02 a partir dos achados dos Agentes AG-1 a AG-5.
--
-- NOTA: As correções de funções/views/FDW no schema evo (AG-1/FIX-1 ao AG-2/FIX-2)
-- não podem ser aplicadas via migration neste repo (gate E42 — fronteira evo).
-- Elas estão documentadas em docs/runbooks/P100_EVO_FIXES_MANUAL.sql
-- para aplicação manual via VPS ou pelo repo evolution-stack.
--
-- Correções incluídas neste arquivo:
--   AG-5/FIX-1 schema graveyard: criar schema + 3 tabelas de arquivo
--
-- ROLLBACK: ver seção final deste arquivo.

-- ─────────────────────────────────────────────────────────────────────────────
-- AG-5/FIX-1: schema graveyard — criar schema + tabelas de arquivo
-- As 3 tabelas de arquivo do PLANO-100 nunca foram criadas (schema inexistente).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS graveyard;

COMMENT ON SCHEMA graveyard IS
  'Schema de arquivo para objetos depreciados do PLANO-100. '
  'Tabelas aqui são somente-leitura por convenção; dados preservados para auditoria.';

-- Arquivo do baseline de índices zero-scan (snapshot pg_stat_user_indexes 2026-08-20)
CREATE TABLE IF NOT EXISTS graveyard._dead_idx_usage_audit_20260820 (
  id            bigserial    PRIMARY KEY,
  archived_at   timestamptz  NOT NULL DEFAULT now(),
  schemaname    text         NOT NULL,
  tablename     text         NOT NULL,
  indexname     text         NOT NULL,
  idx_scan      bigint,
  idx_tup_read  bigint,
  idx_tup_fetch bigint,
  index_size    bigint,
  classification text,
  notes         text
);

COMMENT ON TABLE graveyard._dead_idx_usage_audit_20260820 IS
  'Snapshot de pg_stat_user_indexes capturado em 2026-08-20 para o PLANO-100. '
  'Usado como baseline para gate CP-2 (3 dias coverage ≥99% antes de DROP INDEX lote 1).';

-- Arquivo do watermark de migrations auditadas (PLANO-100 etapa 100)
CREATE TABLE IF NOT EXISTS graveyard._dead_migration_watermark_20260820 (
  id              bigserial    PRIMARY KEY,
  archived_at     timestamptz  NOT NULL DEFAULT now(),
  migration_id    text         NOT NULL,
  applied_at      timestamptz,
  statement_count integer,
  source          text,
  notes           text
);

COMMENT ON TABLE graveyard._dead_migration_watermark_20260820 IS
  'Watermark das migrations auditadas na etapa 100 do PLANO-100 em 2026-08-20. '
  'Referência para auditoria de drift migration×banco.';

-- Arquivo do backfill de mídia desconhecida (lote processado em 2026-08-20)
CREATE TABLE IF NOT EXISTS graveyard._dead_unknown_media_backfill_20260820 (
  id              bigserial    PRIMARY KEY,
  archived_at     timestamptz  NOT NULL DEFAULT now(),
  message_id      text,
  instance_name   text,
  media_url       text,
  mime_type       text,
  file_size       bigint,
  backfill_status text,
  error_msg       text
);

COMMENT ON TABLE graveyard._dead_unknown_media_backfill_20260820 IS
  'Registros de mídia sem tipo definido que foram backfillados em 2026-08-20. '
  'Preservado para rastreabilidade; não reprocessar.';

-- RLS: graveyard é somente-leitura por padrão (nenhuma policy = deny-all para non-owners)
ALTER TABLE graveyard._dead_idx_usage_audit_20260820 ENABLE ROW LEVEL SECURITY;
ALTER TABLE graveyard._dead_migration_watermark_20260820 ENABLE ROW LEVEL SECURITY;
ALTER TABLE graveyard._dead_unknown_media_backfill_20260820 ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK:
--   DROP SCHEMA graveyard CASCADE;
-- ─────────────────────────────────────────────────────────────────────────────
