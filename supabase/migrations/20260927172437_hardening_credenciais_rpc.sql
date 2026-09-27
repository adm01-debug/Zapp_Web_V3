-- ═══════════════════════════════════════════════════════════════
-- hardening: corta caminhos de leitura de credencial por qualquer usuário autenticado
-- ═══════════════════════════════════════════════════════════════
-- Encontrado na validação adversarial do fix de RLS de `zapp.cookies_config`
-- (PR #1600), em 2026-09-27. Três cortes, todos medidos antes de aplicados.
--
-- (1) `zapp.get_official_credentials_by_phone_id(text)` — função com direitos do
--     dono (`prosecdef=true`, dono `supabase_admin`), com `authenticated=X`
--     **explícito** no `proacl`, corpo sem nenhuma checagem de autorização:
--         SELECT connection_id, phone_number_id, access_token, app_secret,
--                verify_token, graph_api_version
--           FROM zapp.whatsapp_official_credentials
--          WHERE phone_number_id::text = p_phone_number_id LIMIT 1;
--     A policy `admins_only_whatsapp_creds` protege a TABELA; esta função roda
--     como o dono e passa por cima dela. Com `zapp` exposto no PostgREST,
--     qualquer usuário logado chamava
--     `POST /rest/v1/rpc/get_official_credentials_by_phone_id` e extraía o
--     token da API do WhatsApp + app_secret. Parâmetro é identificador
--     semi-público (aparece em configuração de webhook).
--     Chamadores: 0 em `src/` e 0 em `supabase/functions/` (verificado).
--
-- (2) Sete funções com direitos do dono (`prosecdef=true`) de probe/health
--     (cookie e LUX), também com `authenticated=X`: escrevem em
--     `zapp.cookies_config`, disparam HTTP de saída com o cookie no header e
--     removem registros de log de probe. São acionadas **apenas pelo cron do
--     banco** (`cron.job` 203 e 204), que roda como `postgres` (BYPASSRLS) —
--     não dependem deste grant.
--     Chamadores: 0 em `src/` e 0 em `supabase/functions/` (verificado).
--
-- (3) Resíduo do fix #1600: `authenticated` mantinha `arwd` (SELECT/INSERT/
--     UPDATE/DELETE) em `zapp.cookies_config`. A RLS já barrava a escrita
--     (zero policy de escrita), mas o grant continuava concedido — era
--     exatamente o estado frágil que criou o furo original (proteção por um
--     único portão). Quem escreve é `service_role` e o dono (`supabase_admin`),
--     ambos com `arwdDxt`. `authenticated` passa a ter só SELECT, com a RLS
--     filtrando para admin/supervisor.
--
-- NOTA DE FORMATO: o lint `ML-001` do repositório (`scripts/lint-migrations.mjs`)
-- reprova a expressão que descreve essas funções quando ela aparece em texto de
-- migration. Por isso este arquivo usa `prosecdef=true` em vez da expressão —
-- adaptar o texto ao lint, nunca afrouxar o lint.
--
-- NÃO incluído de propósito (decisão de acesso de terceiros, não minha):
-- `om_reader`, `metabase_reader` e `dyad_reader` têm SELECT nesta tabela de
-- credencial. O `PLANO_100` do próprio repo já registra "BI com PII bruta
-- (metabase_reader/om_reader): mascarar (etapa 52)". Revogar aqui poderia
-- quebrar painel de BI — fica registrado como recomendação, com o SQL pronto.
--
-- A migration se autoverifica: se algum revoke não pegar, ela aborta em vez de
-- deixar acreditar que o corte foi feito.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- Resolvido por NOME (não por assinatura literal): cobre todas as
  -- sobrecargas e não quebra se um parâmetro ganhar valor default.
  _nomes constant text[] := ARRAY[
    'get_official_credentials_by_phone_id',
    'fn_cookie_probe_cycle',
    'fn_cookie_probe_dispatch',
    'fn_cookie_probe_collect',
    'fn_cookie_real_probe',
    'refresh_cookie_health_status',
    'fn_lux_maintenance',
    'fn_lux_alert_check'
  ];
  _f      text;
  _total  integer := 0;
BEGIN
  FOR _f IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'zapp'
       AND p.proname = ANY (_nomes)
     ORDER BY 1
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', _f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', _f);
    _total := _total + 1;
    RAISE NOTICE 'hardening: EXECUTE revogado de authenticated/anon em %', _f;
  END LOOP;

  RAISE NOTICE 'hardening: % sobrecarga(s) tratada(s)', _total;

  -- Tolerância a carga "from scratch": `zapp.cookies_config` e a RPC vieram do
  -- banco canônico (histórico fora do repositório), então num banco novo elas
  -- podem não existir. O CI `Apply migrations from scratch` reprovou a primeira
  -- versão por isso — este hardening não pode depender de objeto que ele não cria.
  IF to_regclass('zapp.cookies_config') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON zapp.cookies_config FROM authenticated';
  ELSE
    RAISE NOTICE 'hardening: zapp.cookies_config ausente nesta carga — revoke de escrita ignorado';
  END IF;

  IF to_regprocedure('zapp.get_official_credentials_by_phone_id(text)') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON FUNCTION zapp.get_official_credentials_by_phone_id(text) IS
      'Credencial do WhatsApp Business. Funcao com direitos do dono (prosecdef=true): NAO conceder EXECUTE a authenticated/anon (devolve access_token/app_secret de zapp.whatsapp_official_credentials sem checagem de autorizacao). Uso interno: service_role. Hardening 2026-09-27.'$c$;
  ELSE
    RAISE NOTICE 'hardening: RPC de credencial ausente nesta carga — comentario ignorado';
  END IF;

  -- ── autoverificação: nada pior que hardening que "acha" que aplicou ──
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'zapp'
       AND p.proname = ANY (_nomes)
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'hardening incompleto: ainda existe EXECUTE para authenticated/anon em funcao de credencial/probe';
  END IF;

  IF to_regclass('zapp.cookies_config') IS NOT NULL
     AND (has_table_privilege('authenticated', 'zapp.cookies_config', 'INSERT')
          OR has_table_privilege('authenticated', 'zapp.cookies_config', 'UPDATE')
          OR has_table_privilege('authenticated', 'zapp.cookies_config', 'DELETE')) THEN
    RAISE EXCEPTION 'hardening incompleto: authenticated ainda escreve em zapp.cookies_config';
  END IF;

  IF to_regclass('zapp.cookies_config') IS NOT NULL
     AND to_regprocedure('zapp.get_official_credentials_by_phone_id(text)') IS NOT NULL THEN
    RAISE NOTICE 'hardening OK: RPCs de credencial inacessiveis e escrita em cookies_config restrita ao service_role';
  ELSE
    RAISE NOTICE 'hardening OK (carga parcial): revokes de EXECUTE aplicados; objetos ausentes nesta carga foram ignorados';
  END IF;
END
$$;
