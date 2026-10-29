-- ═══════════════════════════════════════════════════════════════
-- INV-8 — nenhuma matview dos schemas deste repositório pode ser legível
--         por `authenticated` ou `anon`
-- ═══════════════════════════════════════════════════════════════
-- Motivo: matview NÃO aceita `ENABLE ROW LEVEL SECURITY` ("This operation is not
-- supported for materialized views"). O único portão que sobra é o GRANT — e o
-- GRANT estava aberto. Medido em 28/09/2026, impersonando cada papel:
--   zapp.mv_conversations_summary -> `authenticated` lia 243 LINHAS, enquanto a
--   tabela base equivalente devolvia 0. Ou seja: agregado com dado de conversa
--   indo para qualquer usuário logado, contornando a RLS da base.
--
-- Isto é a lacuna nº 1 declarada por escrito em `check-rls-coverage.sql`
-- ("O QUE ESTE INVARIANTE NÃO COBRE: 1. matviews"). Fechada pela migration
-- `20260928170000_matviews_revoga_leitura_authenticated.sql`.
--
-- Por que LIVE e não grep: a pergunta é "esta matview está legível HOJE?", e
-- ela só tem resposta no catálogo (`has_table_privilege`), não no texto das
-- migrations — o grant pode vir de `ALTER DEFAULT PRIVILEGES`, de restauração
-- ou de concessão manual no banco.
--
-- Escopo: os mesmos 4 schemas do INV-7 — public, zapp, evo, prospeccao.
-- NÃO cobre schemas de outros sistemas no mesmo Postgres (ai, bpm, email_app,
-- financeiro, ops, vendas, logistica, ...): têm outros donos. Medido em 28/09:
-- os 8 matviews do banco estão em zapp (5) e evo (3); email_app/financeiro
-- não têm matview.
--
-- O QUE ESTE INVARIANTE NÃO COBRE (não presumir cobertura que ele não tem):
--   1. roles com BYPASSRLS (`service_role`, `postgres`, `supabase_admin`,
--      `om_reader`) continuam lendo tudo — por desenho;
--   2. leitores de BI (`metabase_reader`, `dyad_reader`) mantêm SELECT de
--      propósito; expor agregado para ferramenta de BI é decisão de governança,
--      não vazamento de app;
--   3. views sem `security_invoker=true` (229 das 258 de `zapp` em 27/09) e
--      funções SECURITY DEFINER alcançáveis por `authenticated` — cada um tem
--      seu próprio invariante/plano.
--
-- Uso local ou na VPS:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/check-matview-exposure.sql
-- ═══════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

DO $$
DECLARE
  _schemas  constant text[] := ARRAY['public','zapp','evo','prospeccao'];
  _existem  integer;
  _total    integer;
  _vaza     text;
BEGIN
  -- Guarda de escopo: sem os schemas esperados (banco errado, container
  -- trocado, restauração parcial), o invariante não pode responder "OK".
  SELECT count(*) INTO _existem FROM pg_namespace WHERE nspname = ANY (_schemas);
  IF _existem <> array_length(_schemas, 1) THEN
    RAISE EXCEPTION 'INV-8: escopo incompleto — % de % schemas esperados existem (%)',
      _existem, array_length(_schemas, 1), _schemas
      USING HINT = 'Confira a rota/container antes de concluir qualquer coisa deste resultado.';
  END IF;

  SELECT count(*) INTO _total
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'm'
     AND n.nspname = ANY (_schemas);

  -- Guarda de vacuidade: escopo que casa zero matview não é aprovação
  -- (mesmo defeito que o INV-7 teve na primeira versão: "OK — 0 objetos").
  IF _total = 0 THEN
    RAISE EXCEPTION 'INV-8: escopo % não casou nenhuma matview — resultado vazio NÃO é aprovação', _schemas;
  END IF;

  SELECT string_agg(
           format('%s.%s (authenticated=%s, anon=%s)',
             n.nspname, c.relname,
             has_table_privilege('authenticated', c.oid, 'SELECT'),
             has_table_privilege('anon', c.oid, 'SELECT')),
           ', ' ORDER BY 1)
    INTO _vaza
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'm'
     AND n.nspname = ANY (_schemas)
     AND (
       has_table_privilege('authenticated', c.oid, 'SELECT')
       OR has_table_privilege('anon', c.oid, 'SELECT')
     );

  IF _vaza IS NOT NULL THEN
    RAISE EXCEPTION 'INV-8: matview legível por authenticated/anon — %', _vaza
      USING HINT = 'matview não aceita RLS. Revogue a leitura (REVOKE ALL ON <mv> FROM authenticated, anon, PUBLIC) e exponha por service_role, view com security_invoker=true ou RPC.';
  END IF;

  RAISE NOTICE 'INV-8 OK — % matview(s) no escopo; nenhuma legível por authenticated/anon.', _total;
END
$$;
