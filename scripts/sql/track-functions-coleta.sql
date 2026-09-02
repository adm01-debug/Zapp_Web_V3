-- ═══════════════════════════════════════════════════════════════════════════
-- PLANO-100 etapas 38/39 — coleta da janela track_functions (7 dias)
-- ═══════════════════════════════════════════════════════════════════════════
-- Runbook: infra/runbooks/TRACK_FUNCTIONS_JANELA_7D.md
--
-- §1 roda no DIA 0 (logo após ALTER SYSTEM SET track_functions='all').
-- §2/§3 rodam no DIA 7. Nada aqui faz DDL destrutivo; §3 só CONSULTA — a poda
-- é gerada por scripts/sql/track-functions-poda-dryrun.sql e aplicada como
-- migration após revisão.
--
-- NÃO rodar pg_stat_reset() nesta janela (cega watchdogs que consomem deltas
-- de pg_stat_*). A baseline por diferença resolve sem reset.
--
-- Uso (VPS, superuser):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/track-functions-coleta.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── §1 DIA 0 — baseline ────────────────────────────────────────────────────
-- Fotografia de calls por função. O dia 7 compara contra esta tabela por delta.

CREATE TABLE IF NOT EXISTS ops.track_functions_baseline_202608 AS
SELECT now()                                   AS captured_at,
       n.nspname,
       p.proname,
       p.oid,
       pg_get_function_identity_arguments(p.oid) AS args,
       coalesce(f.calls, 0)                    AS calls
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_stat_user_functions f ON f.funcid = p.oid
WHERE n.nspname IN ('zapp', 'evo', 'extensions');

-- ─── §2 DIA 7 — delta por função na janela ─────────────────────────────────
-- calls_na_janela = calls agora − calls no dia 0 (por oid; pg_stat_user_functions
-- é cumulativo desde o último reset do sistema).

CREATE TABLE IF NOT EXISTS ops.track_functions_relatorio_202608 AS
WITH cur AS (
  SELECT p.oid,
         coalesce(f.calls, 0) AS calls
  FROM pg_proc p
  JOIN pg_namespace n  ON n.oid = p.pronamespace
  LEFT JOIN pg_stat_user_functions f ON f.funcid = p.oid
  WHERE n.nspname IN ('zapp', 'evo', 'extensions')
),
delta AS (
  SELECT b.nspname,
         b.proname,
         b.args,
         b.oid,
         greatest(c.calls - b.calls, 0) AS calls_na_janela
  FROM ops.track_functions_baseline_202608 b
  JOIN cur c ON c.oid = b.oid
),
refs AS (
  -- Tudo que pode manter uma função viva APESAR de delta=0 na janela de 7 dias.
  -- (CHECK constraints que chamam funções são raras e pegas na revisão manual
  --  da lista final — aproximação por nome teria falso-positivo alto.)
  SELECT d.oid,
         bool_or(t.tgfoid IS NOT NULL)                    AS em_trigger,
         bool_or(v.viewname IS NOT NULL)                  AS em_view,
         bool_or(dd.oid IS NOT NULL)                      AS em_default_ou_check,
         bool_or(cr.jobid IS NOT NULL)                    AS em_cron
  FROM delta d
  LEFT JOIN pg_trigger t
         ON t.tgfoid = d.oid
  LEFT JOIN pg_views v
         ON v.schemaname IN ('zapp','evo','extensions')
        AND pg_get_viewdef(v.schemaname || '.' || v.viewname) LIKE '%' || d.proname || '%'
  LEFT JOIN pg_attrdef dd
         ON pg_get_expr(dd.adbin, dd.adrelid) LIKE '%' || d.proname || '%'
  LEFT JOIN cron.job cr
         ON cr.command LIKE '%' || d.proname || '%'
  GROUP BY d.oid
)
SELECT d.nspname,
       d.proname,
       d.args,
       d.calls_na_janela,
       coalesce(r.em_trigger, false)       AS em_trigger,
       coalesce(r.em_view, false)          AS em_view,
       coalesce(r.em_default_ou_check, false) AS em_default_ou_check,
       coalesce(r.em_cron, false)          AS em_cron,
       (d.proname LIKE 'rpc_boundary_%')   AS superficie_de_contrato
FROM delta d
LEFT JOIN refs r ON r.oid = d.oid;

-- Resumo executivo da janela
SELECT nspname,
       count(*)                                        AS fns,
       count(*) FILTER (WHERE calls_na_janela > 0)     AS vivas_na_janela,
       count(*) FILTER (WHERE calls_na_janela = 0)     AS zero_chamadas,
       count(*) FILTER (WHERE calls_na_janela = 0
                          AND NOT em_trigger AND NOT em_view
                          AND NOT em_default_ou_check AND NOT em_cron
                          AND NOT superficie_de_contrato) AS candidatas_a_morta
FROM ops.track_functions_relatorio_202608
GROUP BY nspname
ORDER BY nspname;

-- ─── §2b extensions — padrão-de-extensão × custom (etapa 39) ───────────────
-- Função em `extensions` pertence a uma extensão instalada quando pg_depend
-- liga ela à extensão com deptype 'e'. Sem esse vínculo = custom da casa.

SELECT p.proname,
       coalesce(e.extname, '— CUSTOM (sem extensão)') AS origem
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
LEFT JOIN pg_extension e ON e.oid = d.refobjid
WHERE n.nspname = 'extensions'
ORDER BY (e.oid IS NULL) DESC, p.proname;

-- ─── §3 DIA 7 — candidatas a morta (consulta; NÃO é drop) ──────────────────
-- Junta todas as salvaguardas do runbook. A lista resultante ainda precisa de
-- revisão manual (ciclos >7d não capturados por view/cron parcialmente).

SELECT nspname, proname, args
FROM ops.track_functions_relatorio_202608
WHERE calls_na_janela = 0
  AND NOT em_trigger
  AND NOT em_view
  AND NOT em_default_ou_check
  AND NOT em_cron
  AND NOT superficie_de_contrato
ORDER BY nspname, proname;
