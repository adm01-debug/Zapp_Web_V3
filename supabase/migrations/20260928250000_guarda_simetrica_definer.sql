-- 20260928250000_guarda_simetrica_definer.sql
-- ============================================================================
-- CONTEXTO (auditoria adversarial de 28/09/2026, achados 11-13):
--
--  a) REGRESSAO MINHA. Quando zapp.v_cookie_health passou a ler
--     zapp.fn_cookie_health() (migration 20260928220000), a funcao SECURITY DEFINER
--     passou a ignorar a policy is_admin_or_supervisor() que a view security_invoker
--     ANTES respeitava. A guarda que eu escrevi so barrava auth.uid() IS NULL, entao
--     QUALQUER usuario logado passou a ler zapp.cookies_config (3 linhas) - inclusive
--     ate 128 caracteres do corpo cru da resposta do probe em health_error - enquanto
--     o SELECT direto na tabela devolvia 0 e cookie_probe_log respondia
--     'permission denied'. Medido com uid nao-admin: cookies_config direto=0 x
--     v_cookie_health=3, maxlen(health_error)=128.
--
--  b) ASSIMETRIA DE GUARDA. As guardas de rpc_dr_health_check e fn_contact_ranking
--     usavam SO is_admin_or_supervisor(), que depende de auth.uid(). Chamador de
--     servico (cron, edge, psql) nao tem JWT, logo auth.uid() e NULL e a guarda
--     recusava - mesmo padrao que fn_cookie_health ja evitava whitelistando
--     service_role/BI por session_user. Era armadilha latente para automacao.
--
--  c) ESPELHOS MORTOS. As views public.mv_* (security_invoker sobre as matviews de
--     zapp) continuam com GRANT para authenticated mas devolvem
--     'permission denied for materialized view' desde a 20260928163542 (PR #1616),
--     porque o privilegio e reavaliado na matview de zapp, onde a leitura foi
--     revogada. Caminho PostgREST real e sem consumidor: fecha-se explicitamente
--     em vez de deixar um GRANT que mente sobre o que funciona.
--
-- O QUE ESTA MIGRATION FAZ: troca as TRES guardas pela versao SIMETRICA (aceita
-- service_role por claim JWT OU por session_user, as roles de leitura/BI, e
-- admin/supervisor por auth.uid()) e torna explicito o fechamento dos espelhos
-- public.mv_*. NENHUM GRANT NOVO, nenhum privilegio ampliado.
-- ============================================================================

-- 1) a 3) guarda simetrica nas tres funcoes SECURITY DEFINER
CREATE OR REPLACE FUNCTION zapp.fn_cookie_health()
RETURNS TABLE (
  servico text,
  is_healthy boolean,
  health_status text,
  last_health_check_at timestamptz,
  health_error text,
  expires_at timestamptz,
  last_probe_http integer,
  last_probe_ms integer,
  last_probe_preview text,
  mins_since_probe numeric,
  probe_stale boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $fn$
BEGIN
  -- ML-008: SECURITY DEFINER + GRANT EXECUTE TO authenticated exige prova de caller.
  -- Dentro de DEFINER, `current_user` e o DONO (nao o chamador) — entao a prova do
  -- usuario logado vem do JWT (`auth.uid()`), e os leitores de BI/servico entram pelo
  -- `session_user` deles (conexao direta ao Postgres, sem JWT). Chamador desconhecido
  -- sem uid e barrado em vez de herdar os privilegios do dono.
  -- Guarda simetrica (revisao pos-auditoria, 28/09/2026): funcao SECURITY DEFINER nao
  -- pode servir de bypass da RLS. Aceita (1) chamador de servico pelo claim do JWT
  -- (auth.role() = 'service_role', que e como o PostgREST serve service_role),
  -- (2) conexao direta/psql e as roles de leitura/BI pelo session_user, e (3) admin ou
  -- supervisor por auth.uid(). Sem nenhum dos tres, recusa - e nao bloqueia cron/edge
  -- por engano, que era a assimetria medida na auditoria.
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres','supabase_admin','service_role','metabase_reader','dyad_reader','om_reader')
    OR zapp.is_admin_or_supervisor()
  ) THEN
    RAISE EXCEPTION 'forbidden: app member required';
  END IF;

  RETURN QUERY
  SELECT c.servico,
         c.is_healthy,
         c.health_status,
         c.last_health_check_at,
         c.health_error,
         c.expires_at,
         p.http_status,
         p.probe_ms,
         NULL::text,
         EXTRACT(epoch FROM now() - c.last_health_check_at) / 60::numeric,
         (c.last_health_check_at < (now() - '00:35:00'::interval))
    FROM zapp.cookies_config c
    LEFT JOIN LATERAL (
      SELECT pl.http_status, pl.probe_ms
        FROM zapp.cookie_probe_log pl
       WHERE pl.servico = c.servico
       ORDER BY pl.probed_at DESC
       LIMIT 1
    ) p ON true
   ORDER BY c.servico;
END;
$fn$;

CREATE OR REPLACE FUNCTION zapp.rpc_dr_health_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'pg_temp'
AS $function$
DECLARE
  v_db_stats      record;
  v_wh_health     record;
  v_cron_failing  bigint;
  v_open_inc      bigint;
  v_evo_cred      record;
  v_result        jsonb;
BEGIN
  -- GUARDA ANTI-ESCALADA (mesma familia do ML-008): SECURITY DEFINER sem prova de
  -- caller anula a RLS do mesmo jeito que uma view sem security_invoker — a funcao
  -- roda como dona e devolve linha que o chamador nao poderia ler direto.
  -- Medido 28/09/2026: qualquer `authenticated` colhia contato/telefone por aqui.
  -- Guarda simetrica (revisao pos-auditoria, 28/09/2026): funcao SECURITY DEFINER nao
  -- pode servir de bypass da RLS. Aceita (1) chamador de servico pelo claim do JWT
  -- (auth.role() = 'service_role', que e como o PostgREST serve service_role),
  -- (2) conexao direta/psql e as roles de leitura/BI pelo session_user, e (3) admin ou
  -- supervisor por auth.uid(). Sem nenhum dos tres, recusa - e nao bloqueia cron/edge
  -- por engano, que era a assimetria medida na auditoria.
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres','supabase_admin','service_role','metabase_reader','dyad_reader','om_reader')
    OR zapp.is_admin_or_supervisor()
  ) THEN
    RAISE EXCEPTION 'forbidden: app member required';
  END IF;
  SELECT
  CASE WHEN count(*) FILTER (WHERE created_at >= now() - interval '1 hour') > 0 THEN 'healthy'
       WHEN count(*) FILTER (WHERE created_at >= now() - interval '24 hours') > 0 THEN 'degraded'
       ELSE 'critical' END AS health_status,
  max(created_at) AS last_event_at,
  count(*) FILTER (WHERE NOT processed) AS unresponded,
  count(*) FILTER (WHERE created_at >= now() - interval '1 hour') AS events_1h,
  count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS events_24h,
  count(*) FILTER (WHERE processed_at >= now() - interval '1 hour') AS processed_1h
INTO v_wh_health
FROM public.evo_webhook_events_v2;

  BEGIN
    SELECT count(*) INTO v_cron_failing FROM cron.job WHERE active = false;
  EXCEPTION WHEN OTHERS THEN
    v_cron_failing := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_open_inc
    FROM zapp.system_health_incidents WHERE status IN ('open','investigating');
  EXCEPTION WHEN OTHERS THEN
    v_open_inc := 0;
  END;

  BEGIN
    SELECT * INTO v_evo_cred
    FROM zapp.evolution_instance_credentials WHERE instance_name='wpp2' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_evo_cred := NULL;
  END;

  v_result := jsonb_build_object(
    'overall_status', CASE
      WHEN v_wh_health.health_status = 'critical' THEN 'critical'
      WHEN v_open_inc > 0 OR v_cron_failing > 0 THEN 'degraded'
      ELSE 'healthy'
    END,
    'checks', jsonb_build_object(
      'pipeline', jsonb_build_object(
        'status',       v_wh_health.health_status,
        'last_event_at', v_wh_health.last_event_at,
        'pending',      v_wh_health.unresponded
      ),
      'cron_jobs', jsonb_build_object(
        'disabled_count', COALESCE(v_cron_failing, 0),
        'status', CASE WHEN COALESCE(v_cron_failing,0)=0 THEN 'ok' ELSE 'warning' END
      ),
      'incidents', jsonb_build_object(
        'open_count', COALESCE(v_open_inc, 0),
        'status', CASE WHEN COALESCE(v_open_inc,0)=0 THEN 'ok' ELSE 'warning' END
      ),
      'evo_api', jsonb_build_object(
        'instance',       'wpp2',
        'health_status',  COALESCE(v_evo_cred.health_status, 'unknown'),
        'last_check',     v_evo_cred.last_health_check
      ),
      'database', jsonb_build_object('status','ok','checked_at',now())
    ),
    'runbook_steps', 8,
    'generated_at', now()
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.fn_contact_ranking(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, nome text, phone text, score integer, msgs bigint, last_msg timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
BEGIN
  -- GUARDA ANTI-ESCALADA (mesma familia do ML-008): SECURITY DEFINER sem prova de
  -- caller anula a RLS do mesmo jeito que uma view sem security_invoker — a funcao
  -- roda como dona e devolve linha que o chamador nao poderia ler direto.
  -- Medido 28/09/2026: qualquer `authenticated` colhia contato/telefone por aqui.
  -- Guarda simetrica (revisao pos-auditoria, 28/09/2026): funcao SECURITY DEFINER nao
  -- pode servir de bypass da RLS. Aceita (1) chamador de servico pelo claim do JWT
  -- (auth.role() = 'service_role', que e como o PostgREST serve service_role),
  -- (2) conexao direta/psql e as roles de leitura/BI pelo session_user, e (3) admin ou
  -- supervisor por auth.uid(). Sem nenhum dos tres, recusa - e nao bloqueia cron/edge
  -- por engano, que era a assimetria medida na auditoria.
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres','supabase_admin','service_role','metabase_reader','dyad_reader','om_reader')
    OR zapp.is_admin_or_supervisor()
  ) THEN
    RAISE EXCEPTION 'forbidden: app member required';
  END IF;
  RETURN QUERY SELECT c.id,COALESCE(c.full_name,c.push_name)::text,c.phone_number::text,COALESCE(c.lead_score,0),COALESCE(c.total_messages,0)::bigint,c.last_message_at FROM evolution_contacts c WHERE c.deleted_at IS NULL ORDER BY c.lead_score DESC NULLS LAST, c.total_messages DESC NULLS LAST LIMIT p_limit; END; $function$;

-- 4) espelhos public.mv_* das matviews de zapp: fechar explicitamente
DO $do$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS v
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname LIKE 'mv%'
      AND pg_get_viewdef(c.oid, true) LIKE '%zapp.mv_%'
  LOOP
    EXECUTE format('REVOKE ALL ON %s FROM authenticated, anon', r.v);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'guarda-simetrica: espelhos public.mv_* fechados: %', n;
END
$do$;
