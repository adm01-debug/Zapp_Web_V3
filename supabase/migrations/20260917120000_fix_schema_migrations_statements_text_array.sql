-- ============================================================
-- 20260917120000_fix_schema_migrations_statements_text_array.sql
-- Título: Alinha coluna statements do ledger de migrations ao padrão Supabase (text[])
-- Versão: 20260917120000 · Data: 2026-09-17 · Autor: Cline (auditoria Local×GitHub×DB)
-- Tema único: compatibilidade do ledger supabase_migrations.schema_migrations
-- Objetos afetados: supabase_migrations.schema_migrations (coluna statements)
-- Idempotência: DO block guarda por tipo; no-op se já text[]
-- Rollback: ALTER TABLE supabase_migrations.schema_migrations DROP COLUMN statements;
--           ALTER TABLE supabase_migrations.schema_migrations
--             RENAME COLUMN statements_deprecated_legacy TO statements;
-- Refs: db-migrate run #75 (falha e026 linha 161: "column statements is of
--       type integer but expression is of type text[]"); auditoria 2026-09-17
-- ============================================================
-- Contexto: o aplicador infra/db-migrate/apply-migrations.sh registra
-- (version, name), mas migrations com auto-registro no padrão Supabase
-- (statements text[]) falham neste DB porque a coluna foi criada com tipo
-- integer (drift do padrão self-hosted). Isso causou o fail do run #75
-- (2026-09-06) e deixou 6 migrations pendentes por 11 dias. Este fix torna
-- o ledger compatível com o padrão Supabase, preservando a coluna antiga
-- renomeada (sem perda de dados).
DO $fix$
DECLARE
  v_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_type
  FROM pg_attribute a
  WHERE a.attrelid = 'supabase_migrations.schema_migrations'::regclass
    AND a.attname = 'statements'
    AND NOT a.attisdropped;

  IF v_type IS NULL THEN
    RAISE NOTICE 'statements: coluna inexistente — criando text[]';
    ALTER TABLE supabase_migrations.schema_migrations
      ADD COLUMN IF NOT EXISTS statements text[];
  ELSIF v_type = 'text[]' THEN
    RAISE NOTICE 'statements: já text[] — no-op';
  ELSE
    RAISE NOTICE 'statements: tipo atual % — preservando como statements_deprecated_legacy e criando text[]', v_type;
    ALTER TABLE supabase_migrations.schema_migrations
      RENAME COLUMN statements TO statements_deprecated_legacy;
    ALTER TABLE supabase_migrations.schema_migrations
      ADD COLUMN IF NOT EXISTS statements text[];
  END IF;
END $fix$;
