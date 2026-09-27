-- hardening P0 — zapp.cookies_config (auditoria 2026-09-27, dimensoes 3 e 16)
--
-- DEFEITO: a tabela guarda credencial de integracao (cookie, token, csrf_token) e
-- estava com ROW LEVEL SECURITY DESLIGADO. A policy `cookies_admin_select` existia
-- no banco, mas policy sem RLS e inerte: o unico gate que sobrava era o GRANT, e
-- `authenticated` tinha SELECT/INSERT/UPDATE/DELETE. Consequencia: qualquer usuario
-- logado lia as credenciais na tabela e tambem pela view `public.cookies_config`
-- (security_invoker=true herda a RLS do chamador — com a RLS desligada na origem,
-- nao havia o que herdar).
--
-- O irmao `prospeccao.cookies_config` (cookies Lusha/LinkedIn) ja foi fechado em
-- 20260927123617_rls_prospeccao_hardening.sql; esta migration fecha o do zapp.
--
-- ESCOPO: apenas o schema zapp. Nao toca public, evo nem prospeccao.
--
-- ROLLBACK (manual, se necessario reabrir):
--   DROP POLICY IF EXISTS cookies_admin_select ON zapp.cookies_config;
--   ALTER TABLE zapp.cookies_config DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.cookies_config TO authenticated;

-- 1. Liga a RLS. Sem isto, toda policy nesta tabela e decorativa.
ALTER TABLE zapp.cookies_config ENABLE ROW LEVEL SECURITY;

-- 2. Materializa no repo a policy que so existia no banco (drift) e a preserva:
--    leitura apenas para admin/supervisor, via a guarda padrao do projeto.
DROP POLICY IF EXISTS cookies_admin_select ON zapp.cookies_config;
CREATE POLICY cookies_admin_select ON zapp.cookies_config
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- 3. Credencial de terceiro nao se escreve pelo navegador: nenhuma policy de
--    INSERT/UPDATE/DELETE e criada, entao com a RLS ligada a escrita pelo papel
--    `authenticated` fica negada. service_role nao e revogado de proposito: a
--    automacao que renova os cookies roda com service_role/postgres, que
--    legitimamente ignora RLS, e continua funcionando.
COMMENT ON TABLE zapp.cookies_config IS
  'Credenciais de integracao (cookie/token/csrf_token). RLS ligada: SELECT restrito a admin/supervisor; escrita exclusiva de service_role. Migration 20260927162834_rls_cookies_config.sql';
