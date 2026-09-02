-- Achado de auditoria (2026-09-02): zapp.fn_require_app_user() tinha logica fail-open --
-- `IF auth.uid() IS NOT NULL THEN <checa membership> END IF` significa que, se
-- auth.uid() for NULL (chamador `anon`/sem sessao), a funcao retornava void SEM
-- levantar excecao nenhuma, em vez de bloquear.
--
-- Nao ha exploracao ativa confirmada hoje: nenhuma RPC que depende so desta guarda
-- tem EXECUTE concedido a `anon` no momento (confirmado via has_function_privilege).
-- Mas e uma armadilha de design -- qualquer RPC futura que reutilize esta guarda e
-- ganhe EXECUTE para `anon` ficaria aberta para chamadas 100% anonimas. Corrigido
-- para exigir explicitamente auth.uid() IS NOT NULL antes de checar membership.
CREATE OR REPLACE FUNCTION zapp.fn_require_app_user()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden: app member required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM zapp.profiles WHERE user_id = auth.uid())
     OR NOT EXISTS (SELECT 1 FROM zapp.user_roles WHERE user_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: app member required' USING ERRCODE = '42501';
  END IF;
END;
$function$;
