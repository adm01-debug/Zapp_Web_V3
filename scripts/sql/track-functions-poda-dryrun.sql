-- ═══════════════════════════════════════════════════════════════════════════
-- PLANO-100 etapa 38 — DRY-RUN de poda de funções mortas (não executa nada)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pré-requisito: ops.track_functions_relatorio_202608 populado (dia 7, script
-- track-functions-coleta.sql §2) e lista §3 REVISADA por humano.
--
-- Este script:
--   1. Gera os statements DROP como TEXTO (salvar, revisar, transformar em
--      migration versionada).
--   2. Flagga funções que têm dependentes no pg_depend (índices funcionais,
--      casts, tipos) — essas exigem inspeção antes de qualquer DROP.
--
-- NUNCA gerar DROP ... CASCADE sem inspecionar a coluna dependentes primeiro.
--
-- Uso (VPS):
--   psql "$SUPABASE_DB_URL" -At -f scripts/sql/track-functions-poda-dryrun.sql \
--     > poda-funcoes-dryrun.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Painel: dependentes por candidata (revisar antes de salvar os DROPs)
SELECT r.nspname,
       r.proname,
       count(dep.objid) AS dependentes_cat,
       string_agg(DISTINCT dep.deptype, ',') AS tipos_dependencia
FROM ops.track_functions_relatorio_202608 r
LEFT JOIN pg_depend dep
       ON dep.refobjid = (SELECT p.oid FROM pg_proc p
                          JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = r.nspname AND p.proname = r.proname)
WHERE r.calls_na_janela = 0
  AND NOT r.em_trigger AND NOT r.em_view
  AND NOT r.em_default_ou_check AND NOT r.em_cron
  AND NOT r.superficie_de_contrato
GROUP BY r.nspname, r.proname
HAVING count(dep.objid) > 0
ORDER BY dependentes_cat DESC, r.nspname, r.proname;

-- Geração dos statements (texto; revisar e versionar como migration)
SELECT 'DROP FUNCTION IF EXISTS ' || r.nspname || '.' || r.proname
       || '(' || r.args || ');'
       || '  -- dependentes_cat=' || coalesce(dd.n, 0)
       || CASE WHEN coalesce(dd.n, 0) > 0
               THEN '  -- ⚠️ INSPECIONAR ANTES (ver painel acima)'
               ELSE '' END
FROM ops.track_functions_relatorio_202608 r
LEFT JOIN (
  SELECT dep.refobjid, count(*) AS n
  FROM pg_depend dep
  JOIN pg_proc p ON p.oid = dep.refobjid
  GROUP BY dep.refobjid
) dd ON dd.refobjid = (
  SELECT p.oid FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = r.nspname AND p.proname = r.proname
)
WHERE r.calls_na_janela = 0
  AND NOT r.em_trigger AND NOT r.em_view
  AND NOT r.em_default_ou_check AND NOT r.em_cron
  AND NOT r.superficie_de_contrato
ORDER BY r.nspname, r.proname;
