-- ═══════════════════════════════════════════════════════════════
-- INV-7 — RLS ligada em 100% das tabelas dos schemas deste repositório
-- ═══════════════════════════════════════════════════════════════
-- Motivo (defeito real, 27/09/2026): `zapp.cookies_config` — que guarda
-- `cookie`, `token` e `csrf_token` de integração — estava com RLS **desligada**.
-- A policy `cookies_admin_select` existia no banco desde antes, mas **policy sem
-- RLS é decorativa**: o único portão que sobrava era o GRANT, e `authenticated`
-- tinha SELECT/INSERT/UPDATE/DELETE. Qualquer usuário logado lia as credenciais
-- direto na tabela e também pela view `public.cookies_config`
-- (`security_invoker=true` herda a RLS do chamador; sem RLS na origem, não havia
-- o que herdar). Corrigido em `20260927162834_rls_cookies_config.sql`.
--
-- Por que um invariante LIVE e não grep: a pergunta que importa é "a tabela está
-- protegida hoje?", e ela só tem resposta no catálogo. O `CREATE POLICY` morava
-- num arquivo de migração; o `ENABLE ROW LEVEL SECURITY` é que faltava — e nada
-- garantia que os dois andassem juntos.
--
-- Escopo: os 4 schemas deste repositório — public, zapp, evo, prospeccao.
-- NÃO cobre schemas de outros sistemas no mesmo Postgres (ai, bpm, email_app,
-- financeiro, ops, vendas, logistica, ...): têm outros donos.
--
-- Particionamento: `relkind IN ('r','p')` inclui a tabela particionada E as
-- filhas, porque **filha não herda a RLS do pai** (o Postgres exige ENABLE por
-- relação). Medido em 27/09/2026: 20 partições, 20 com RLS.
--
-- Uso local ou na VPS:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/check-rls-coverage.sql
-- ═══════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- 1) O invariante que BLOQUEIA: nenhuma tabela/partição sem RLS.
DO $$
DECLARE
  _schemas  constant text[] := ARRAY['public','zapp','evo','prospeccao'];
  _total    integer;
  _faltando text;
BEGIN
  SELECT count(*)
    INTO _total
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','p')
     AND n.nspname = ANY (_schemas);

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
