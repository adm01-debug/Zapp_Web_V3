-- ═══════════════════════════════════════════════════════════════
-- INV-7 — RLS ligada em 100% das tabelas dos schemas deste repositório
-- ═══════════════════════════════════════════════════════════════
-- Motivo (defeito real, 27/09/2026): `zapp.cookies_config` — que guarda
-- `cookie`, `token` e `csrf_token` de integração — estava com RLS **desligada**.
-- A policy `cookies_admin_select` existia no banco desde antes, mas **policy sem
-- RLS é decorativa**: o único portão que sobrava era o GRANT, e `authenticated`
-- tinha SELECT/INSERT/UPDATE/DELETE. Corrigido em
-- `20260927162834_rls_cookies_config.sql`.
--
-- CORREÇÃO DE REGISTRO (feita na validação adversarial de 27/09): a versão
-- original deste comentário dizia que a view `public.cookies_config` também
-- expunha as linhas desta tabela. **É falso.** `pg_get_viewdef` mostra
-- `... FROM prospeccao.cookies_config` — a view lê de OUTRA tabela (do schema
-- `prospeccao`, já fechada em `20260927123617`). O vetor real era o acesso
-- **direto** à tabela `zapp.cookies_config` via PostgREST. O comentário errado
-- está no arquivo da migration #1600, no corpo daquele PR e no teste
-- `rls-cookies-config.test.ts` — corrigidos aqui para o histórico não propagar
-- a afirmação.
--
-- Por que um invariante LIVE e não grep: a pergunta que importa é "a tabela está
-- protegida hoje?", e ela só tem resposta no catálogo. O `CREATE POLICY` morava
-- num arquivo de migração; o `ENABLE ROW LEVEL SECURITY` é que faltava — e nada
-- garantia que os dois andassem juntos.
--
-- Escopo: os 4 schemas deste repositório — public, zapp, evo, prospeccao.
-- NÃO cobre schemas de outros sistemas no mesmo Postgres (ai, bpm, email_app,
-- financeiro, ops, vendas, logistica, ...): têm outros donos. Medido em 27/09:
-- fora destes 4 (e dos schemas de sistema) existem 10 tabelas sem RLS, em
-- `archive` (2) e `_backups` (8); no banco inteiro são 40.
--
-- Particionamento: `relkind IN ('r','p')` inclui a tabela particionada E as
-- filhas, porque **filha não herda a RLS do pai** (o Postgres exige ENABLE por
-- relação). Medido em 27/09/2026: 20 partições, 20 com RLS.
--
-- O QUE ESTE INVARIANTE NÃO COBRE (medido na validação de 27/09 — não presumir
-- cobertura que ele não tem):
--   1. **matviews**: o Postgres não aceita `ENABLE ROW LEVEL SECURITY` nelas
--      ("This operation is not supported for materialized views"). Prova
--      empírica do furo: como `authenticated`, `zapp.mv_conversations_summary`
--      devolve 243 linhas e a tabela base `zapp.conversations` devolve 0.
--   2. **views sem `security_invoker=true`**: executam com os direitos do dono
--      (role com BYPASSRLS) e furam a RLS da base. Medido: 229 das 258 views de
--      `zapp` estão nessa condição.
--   3. **funções SECURITY DEFINER / RPCs** alcançáveis por `authenticated`.
--   4. **roles com BYPASSRLS** (`service_role`, `postgres`, `supabase_admin`,
--      `om_reader`) e ausência de `FORCE ROW LEVEL SECURITY` em 100% das
--      relações.
--   5. **semântica da policy**: este invariante prova que a RLS está ligada, não
--      que a policy está correta — `USING (true)` para `authenticated` passaria
--      verde. Medido em 27/09: 0 ocorrências nos 4 schemas (fora de
--      `zapp.sentry_config`, cujo `dsn` é identificador público por design).
--
-- Uso local ou na VPS:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/check-rls-coverage.sql
-- ═══════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- 1) O invariante que BLOQUEIA: nenhuma tabela/partição sem RLS.
DO $$
DECLARE
  _schemas  constant text[] := ARRAY['public','zapp','evo','prospeccao'];
  _existem  integer;
  _total    integer;
  _faltando text;
BEGIN
  -- Guarda de escopo: se os schemas não existirem (banco errado, container
  -- trocado, restauração parcial), o invariante não pode responder "OK".
  SELECT count(*) INTO _existem
    FROM pg_namespace WHERE nspname = ANY (_schemas);

  IF _existem <> array_length(_schemas, 1) THEN
    RAISE EXCEPTION 'INV-7: escopo incompleto — % de % schemas esperados existem (%). Banco errado ou restauração parcial?',
      _existem, array_length(_schemas, 1), _schemas
      USING HINT = 'Confira a rota/container antes de concluir qualquer coisa deste resultado.';
  END IF;

  SELECT count(*)
    INTO _total
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','p')
     AND n.nspname = ANY (_schemas);

  -- Guarda de vacuidade: escopo que casa zero relações não é aprovação.
  -- (Defeito encontrado na validação de 27/09: sem esta guarda, um escopo sem
  -- correspondência produzia "INV-7 OK — 0 tabelas/partições", ou seja, verde
  -- com zero cobertura.)
  IF _total = 0 THEN
    RAISE EXCEPTION 'INV-7: escopo % não casou nenhuma tabela/partição — resultado vazio NÃO é aprovação', _schemas;
  END IF;

  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1)
    INTO _faltando
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','p')
     AND NOT c.relrowsecurity
     AND n.nspname = ANY (_schemas);

  IF _faltando IS NOT NULL THEN
    RAISE EXCEPTION 'INV-7: tabela(s) sem RLS nos schemas do app — %', _faltando
      USING HINT = 'Ligue a RLS na MESMA migração que cria/entrega a tabela: ALTER TABLE <schema>.<tabela> ENABLE ROW LEVEL SECURITY. Sem isso, policy alguma protege e o único portão fica sendo o GRANT.';
  END IF;

  RAISE NOTICE 'INV-7 OK — % tabelas/partições com RLS em %.', _total, _schemas;
END
$$;

-- 2) Aviso (não bloqueia): RLS ligada e NENHUMA policy ⇒ a tabela ficou
--    exclusiva de service_role. Há caso legítimo (tabela de credencial, como
--    `prospeccao.cookies_config`), então listar ajuda a revisar, mas reprovar
--    quebraria um desenho correto.
DO $$
DECLARE
  _qtd  integer;
  _lista text;
BEGIN
  SELECT count(*), string_agg(t, ', ' ORDER BY t)
    INTO _qtd, _lista
    FROM (
      SELECT n.nspname || '.' || c.relname AS t
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r','p')
         AND c.relrowsecurity
         AND n.nspname = ANY (ARRAY['public','zapp','evo','prospeccao'])
         AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    ) s;

  IF _qtd > 0 THEN
    RAISE NOTICE 'INV-7 aviso: % tabela(s) com RLS e zero policy (exclusivo de service_role): %', _qtd, _lista;
  ELSE
    RAISE NOTICE 'INV-7 aviso: nenhuma tabela com RLS e zero policy.';
  END IF;
END
$$;
