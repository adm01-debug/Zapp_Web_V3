-- Hardening do schema prospeccao — fecha o P0 A-F8-001 da auditoria de 2026-09-27.
--
-- O QUE ESTAVA ERRADO (medido, nao suposto)
--
-- Com a chave `anon` — que e PUBLICA, esta no bundle de producao do site — qualquer
-- visitante lia o schema inteiro por PostgREST:
--     GET /rest/v1/cookies_config?select=*   Accept-Profile: prospeccao  -> HTTP 200
--     colunas: cookie, token, csrf_token (= sessoes Lusha/LinkedIn), nome, telefone, linkedin_url
-- As quatro tabelas estavam sem RLS (`pg_class.relrowsecurity = false`) e tinham
-- GRANT TOTAL para `anon` — incluindo DELETE, TRUNCATE, UPDATE e INSERT. Nao era so
-- vazamento de leitura: dava para APAGAR as listas de prospeccao de fora.
-- `authenticated` tambem tinha TRUNCATE/REFERENCES/TRIGGER, e RLS nao filtra TRUNCATE.
-- A view public.cookies_config tambem expunha o schema (mas tem security_invoker=true,
-- entao respeita o RLS daqui — foi conferido em pg_class.reloptions).
--
-- QUEM USA (levantado antes de mexer, para nao quebrar nada)
--   * codigo do app (src/, supabase/functions/): NENHUMA referencia a prospeccao
--   * funcoes/RPCs e cron.job no banco: NENHUMA referencia
--   * unico consumidor vivo: a automacao de prospeccao via `service_role`
--     (visto em pg_stat_statements: lookup de dedupe em prospeccao.contatos)
--   * essa automacao esta DORMANTE: cookies_config.atualizado_em parou em 17 e 21/07
--     e os dois expires_at ja venceram (14/08 e 13/09). Mesmo assim, o fix NAO
--     depende disso: service_role ignora RLS e mantem os grants, entao a automacao
--     volta a funcionar igual quando for religada.
--
-- DESENHO
--   1. RLS ligado nas quatro tabelas.
--   2. `anon` perde tudo, no schema e nas tabelas (defesa em profundidade: sem USAGE
--      no schema, o PostgREST nem resolve o nome).
--   3. `authenticated` perde o que RLS nao protege: TRUNCATE, REFERENCES, TRIGGER.
--      SELECT/INSERT/UPDATE/DELETE continuam, mas passam a ser filtrados por policy.
--   4. Policy de staff (zapp.is_admin_or_supervisor — a mesma guarda usada no resto do
--      app) nas tres tabelas operacionais.
--   5. `prospeccao.cookies_config` fica SEM policy nenhuma: so `service_role` (que tem
--      BYPASSRLS) le/escreve. E o mesmo padrao ja usado em zapp.whatsapp_official_
--      credentials — credencial de terceiro nao desce para o navegador.
--   6. `service_role` nao e tocado em nenhum ponto.
--
-- ROLLBACK (se algo quebrar, e so desfazer isto)
--   DROP POLICY IF EXISTS prospeccao_empresas_staff ON prospeccao.empresas;
--   DROP POLICY IF EXISTS prospeccao_contatos_staff ON prospeccao.contatos;
--   DROP POLICY IF EXISTS prospeccao_execucoes_staff ON prospeccao.execucoes;
--   ALTER TABLE prospeccao.empresas       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE prospeccao.contatos       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE prospeccao.execucoes      DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE prospeccao.cookies_config DISABLE ROW LEVEL SECURITY;
--   GRANT USAGE ON SCHEMA prospeccao TO anon;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA prospeccao TO anon;
--   (o vazamento volta — so use se o fix tiver quebrado algo real, e nos diga o que)

-- 1) RLS em tudo
ALTER TABLE prospeccao.empresas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao.contatos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao.execucoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao.cookies_config ENABLE ROW LEVEL SECURITY;

-- 2) anon fora — das tabelas e do schema
REVOKE ALL ON prospeccao.empresas, prospeccao.contatos, prospeccao.execucoes, prospeccao.cookies_config FROM anon, PUBLIC;
REVOKE USAGE ON SCHEMA prospeccao FROM anon, PUBLIC;

-- 3) o que RLS nao cobre
REVOKE TRUNCATE, REFERENCES, TRIGGER ON prospeccao.empresas, prospeccao.contatos, prospeccao.execucoes, prospeccao.cookies_config FROM authenticated;

-- 4) policies de staff nas tabelas operacionais (idempotente)
DROP POLICY IF EXISTS prospeccao_empresas_staff  ON prospeccao.empresas;
DROP POLICY IF EXISTS prospeccao_contatos_staff  ON prospeccao.contatos;
DROP POLICY IF EXISTS prospeccao_execucoes_staff ON prospeccao.execucoes;

CREATE POLICY prospeccao_empresas_staff ON prospeccao.empresas
  FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

CREATE POLICY prospeccao_contatos_staff ON prospeccao.contatos
  FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

CREATE POLICY prospeccao_execucoes_staff ON prospeccao.execucoes
  FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

-- 5) cookies_config: nenhuma policy, de proposito. So service_role (BYPASSRLS) acessa.
--    Se um dia a UI precisar mostrar saude do cookie, faca por edge function com
--    service_role e devolva apenas is_healthy/health_status — nunca cookie/token.
