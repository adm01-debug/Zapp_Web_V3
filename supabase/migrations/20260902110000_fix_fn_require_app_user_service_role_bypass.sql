-- Achado do cubic (confianca 10, review do PR #1483) sobre a migration 20260902090000:
-- o fix anterior de fn_require_app_user() bloqueava QUALQUER chamador com
-- auth.uid() IS NULL -- mas isso inclui chamadas legitimas via service_role
-- (edge functions, cron), nao so chamadas anonimas de fato. auth.uid() e NULL
-- tanto para `anon` quanto para `service_role`, ja que nenhum dos dois carrega
-- um "sub" (uid) de usuario no JWT -- a distincao correta e por auth.role().
--
-- Confirmado ao vivo (2026-09-02): 54 funcoes em zapp chamam
-- PERFORM zapp.fn_require_app_user() incondicionalmente (sem checar
-- auth.role() antes), incluindo zapp.get_companies_by_phones_batch e
-- zapp.rpc_list_messages_lite (citadas pelo cubic) e zapp.rpc_upsert_contact.
-- Todas essas 54 funcoes tem EXECUTE para service_role -- ou seja, qualquer
-- chamada feita via service_role (createZappAdminClient(), a forma padrao
-- de edge functions chamarem RPCs administrativamente) estava sendo
-- rejeitada com "forbidden: app member required" desde a migration anterior.
--
-- Testado ao vivo: com request.jwt.claims={"role":"service_role"}, a funcao
-- agora passa; com {"role":"anon"}, continua bloqueada.
CREATE OR REPLACE FUNCTION zapp.fn_require_app_user()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'forbidden: app member required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM zapp.profiles WHERE user_id = auth.uid())
       OR NOT EXISTS (SELECT 1 FROM zapp.user_roles WHERE user_id = auth.uid())
       AND NOT EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()) THEN
      RAISE EXCEPTION 'forbidden: app member required' USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$function$;
