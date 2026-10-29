-- Hardening das funcoes SECURITY DEFINER com dado sensivel (auditoria adversarial 28/09/2026)
--
-- PROBLEMA MEDIDO (nao suposto): ha funcoes SECURITY DEFINER em `zapp` com EXECUTE para
-- `authenticated` e SEM prova de caller. Como rodam com privilegio do dono, anulam a RLS
-- por dentro: o chamador recebe linha que nao poderia ler na tabela. Medido chamando como
-- `authenticated` sem perfil (apenas contagens, nenhum valor de cliente impresso):
--
--   fn_contact_ranking(10)     -> 10 linhas, 7 com telefone preenchido (PII de contato)
--   fn_search_contacts('a',5)  ->  5 registros de contato, 5 telefones
--   rpc_get_notifications(10)  -> 10 linhas, enquanto o SELECT direto na tabela davam 0
--   rpc_dr_health_check()      -> telemetria lida da tabela de credenciais e do cron.job
--
-- POR QUE ESTA MIGRATION EXISTE SEPARADAMENTE
--   Gate de view e funcao DEFINER sao o MESMO buraco por duas portas: view sem
--   security_invoker roda como dona; funcao DEFINER sem guarda idem. A trilha de views
--   foi fechada antes; esta fecha as funcoes.
--
-- ESCOPO: SOMENTE o schema `zapp`. As funcoes com o mesmo defeito em `financeiro`
-- (ranking_vendas_hoje/finaldemes) e em evo (rpc_boundary_*) NAO entram: sao de outros
-- donos e a fronteira de DDL do evo e protegida pelo gate E42. Ficam reportadas.
--
-- CRITERIO CASO A CASO (cada funcao, uma decisao escrita)
--   1. fn_contact_ranking ..... guarda admin/supervisor (devolve PII de contato)
--   2. rpc_dr_health_check .... guarda admin/supervisor (le credencial e cron.job)
--   3. fn_search_contacts ..... REVOKE de authenticated: e LANGUAGE sql e nao tem coluna
--                               de dono para escopar; religar exige corpo novo escopado
--   4. rpc_get_notifications .. REVOKE de authenticated: idem (corpo nao filtra por usuario)
--
-- Nenhum GRANT novo. As quatro mudancas APERTAM (guard ou revoke), nenhuma amplia.
-- Reversao: re-conceder EXECUTE e/ou trocar para current_user_is_privileged().

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
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'forbidden: app member required';
  END IF;
  RETURN QUERY SELECT c.id,COALESCE(c.full_name,c.push_name)::text,c.phone_number::text,COALESCE(c.lead_score,0),COALESCE(c.total_messages,0)::bigint,c.last_message_at FROM evolution_contacts c WHERE c.deleted_at IS NULL ORDER BY c.lead_score DESC NULLS LAST, c.total_messages DESC NULLS LAST LIMIT p_limit; END; $function$;


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
  IF NOT zapp.is_admin_or_supervisor() THEN
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

-- 3) fn_search_contacts: LANGUAGE sql, sem coluna de dono para escopar.
REVOKE ALL ON FUNCTION zapp.fn_search_contacts(text, integer) FROM authenticated;
REVOKE ALL ON FUNCTION zapp.fn_search_contacts(text, integer) FROM anon, PUBLIC;

-- 4) rpc_get_notifications: o corpo nao filtra por usuario; SELECT direto na tabela
--    ja devolvia 0 por RLS, entao a RPC era um desvio de escopo.
REVOKE ALL ON FUNCTION zapp.rpc_get_notifications(integer, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION zapp.rpc_get_notifications(integer, boolean) FROM anon, PUBLIC;

-- Defensivo: nenhuma das quatro alcancavel por `anon`.
REVOKE ALL ON FUNCTION zapp.fn_contact_ranking(integer) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION zapp.rpc_dr_health_check() FROM anon, PUBLIC;
