-- Materializa no repo objetos de RBAC/RLS que já existem e estão ativos em
-- produção, mas nunca tiveram um CREATE FUNCTION/CREATE POLICY versionado em
-- nenhuma migration do repo (achado da auditoria docs/audit-2026-09-02/,
-- confirmado ao vivo via MCP SUPABASE_SELF_HOSTED_-_MCP em 2026-09-02).
--
-- ZERO mudança de comportamento: toda definição abaixo foi extraída via
-- pg_get_functiondef()/pg_get_expr() diretamente do banco de produção antes
-- de escrever este arquivo. CREATE OR REPLACE FUNCTION é no-op se o corpo já
-- bater (idempotente); ops.safe_create_policy() só cria a policy se ela não
-- existir (idempotente, sem DROP, sem reload desnecessário do PostgREST —
-- padrão já usado no restante do repo, ver Migration Lint no CI).
--
-- Motivação: sem isso, não é possível reconstruir a partir do repo a lógica
-- de autorização que decide acesso em produção hoje — risco real de
-- disaster-recovery e de auditoria, não de segurança (as funções/policies já
-- estão corretas e ativas).

-- ─── Helper de policy idempotente (também sem migration própria em produção —
-- mesmo padrão de drift; materializada aqui porque as policies abaixo dependem
-- dela, e o CI recomenda seu uso no lugar de DROP+CREATE) ──────────────────

CREATE SCHEMA IF NOT EXISTS ops;

CREATE OR REPLACE FUNCTION ops.safe_create_policy(p_schema text, p_table text, p_name text, p_definition text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policy pc
    JOIN pg_class  c ON c.oid = pc.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = p_schema AND c.relname = p_table AND pc.polname = p_name
  ) INTO v_exists;

  IF NOT v_exists THEN
    EXECUTE format('CREATE POLICY %I ON %I.%I %s', p_name, p_schema, p_table, p_definition);
    RETURN 'created';
  ELSE
    RETURN 'already_exists';  -- zero DDL, zero NOTIFY pgrst
  END IF;
END;
$function$;

-- SECURITY DEFINER + PUBLIC executável por padrão no Postgres a menos que
-- revogado explicitamente (achado do Copilot, review do PR #1483): sem isso,
-- qualquer role com USAGE em ops poderia chamar a função pra criar/alterar
-- policies arbitrárias. Producao ja tem isso revogado (confirmado ao vivo via
-- has_function_privilege('public', ..., 'EXECUTE') = false) — só nao estava
-- na migration, que so materializava o corpo da funcao via pg_get_functiondef
-- (que nao inclui GRANT/REVOKE).
REVOKE EXECUTE ON FUNCTION ops.safe_create_policy(text, text, text, text) FROM PUBLIC;

-- ─── Funções RBAC ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.get_user_department(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$ SELECT p.department_id FROM zapp.profiles p WHERE p.user_id = _user_id LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION zapp.has_role(_user_id uuid, _role zapp.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
  SELECT
    (_user_id IS NOT DISTINCT FROM auth.uid())
    AND EXISTS (
      SELECT 1 FROM zapp.user_roles
      WHERE user_id = _user_id AND role = _role
    )
$function$;

CREATE OR REPLACE FUNCTION zapp.user_has_permission(_user_id uuid, _permission_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
  SELECT
    (_user_id IS NOT DISTINCT FROM auth.uid())
    AND EXISTS (
      SELECT 1 FROM zapp.user_roles ur
      JOIN zapp.role_permissions rp ON rp.role = ur.role
      JOIN zapp.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = _user_id
        AND p.name = _permission_name
    )
$function$;

CREATE OR REPLACE FUNCTION zapp.can_supervise_profile(_user_id uuid, _target_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
  SELECT zapp.is_manager_or_above(_user_id)
    OR (
      zapp.has_role(_user_id, 'supervisor')
      AND zapp.get_user_department(_user_id) IS NOT NULL
      AND zapp.get_user_department(_user_id) = (
        SELECT department_id FROM zapp.profiles WHERE id = _target_profile_id LIMIT 1
      )
    )
    OR EXISTS (
      SELECT 1 FROM zapp.profiles WHERE id = _target_profile_id AND user_id = _user_id
    );
$function$;

CREATE OR REPLACE FUNCTION zapp.can_user_see_contact(_user_id uuid, _contact_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
  SELECT zapp.is_manager_or_above(_user_id)
    OR (
      zapp.has_role(_user_id, 'supervisor')
      AND zapp.get_user_department(_user_id) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM zapp.contacts c
        JOIN zapp.profiles p ON p.id::text = c.assigned_to
        WHERE c.id = _contact_id AND p.department_id = zapp.get_user_department(_user_id)
      )
    )
    OR EXISTS (
      SELECT 1 FROM zapp.contacts c
      JOIN zapp.profiles p ON p.id::text = c.assigned_to
      WHERE c.id = _contact_id AND p.user_id = _user_id
    );
$function$;

CREATE OR REPLACE FUNCTION zapp.log_security_event(p_event_type text, p_resource text, p_action text, p_status text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  INSERT INTO zapp.audit_logs (user_id, action, entity_type, details)
  VALUES (
    auth.uid(),
    p_action,
    p_resource,
    COALESCE(p_details, '{}'::jsonb)
      || jsonb_build_object('event_type', p_event_type, 'status', p_status)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.check_user_permission(p_permission_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
    v_has_permission BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM zapp.role_permissions rp
        JOIN zapp.user_roles ur ON ur.role = rp.role
        JOIN zapp.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = auth.uid() AND p.name = p_permission_name
    ) INTO v_has_permission;
    IF NOT v_has_permission THEN
        PERFORM zapp.log_security_event('unauthorized_access', 'permission:' || p_permission_name, 'EXECUTE', 'denied');
    END IF;
    RETURN v_has_permission;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
BEGIN
  INSERT INTO zapp.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$function$;

-- ─── Policies RLS órfãs em tabelas críticas ────────────────────────────────
-- (contatos, empresas, profiles, user_roles, workspace_members, webhook_events_processed)

-- is_admin_or_supervisor() qualificado com o schema (achado do Copilot,
-- review do PR #1483): ops.safe_create_policy roda com search_path fixo em
-- 'pg_catalog','public' (SECURITY DEFINER), então o EXECUTE dinâmico do
-- CREATE POLICY resolveria o nome sem schema contra esse search_path — a
-- função só existe em zapp, não em public. Sem qualificar, a policy só
-- funciona hoje porque já existe em produção (safe_create_policy no-opa
-- antes de tentar criar); num rebuild do zero, o CREATE falharia com
-- "function is_admin_or_supervisor() does not exist".
SELECT ops.safe_create_policy('zapp', 'workspace_members', 'auth_secure_128',
  $$FOR ALL TO authenticated USING ((user_id = (select auth.uid())) OR zapp.is_admin_or_supervisor()) WITH CHECK ((user_id = (select auth.uid())) OR zapp.is_admin_or_supervisor())$$);

SELECT ops.safe_create_policy('zapp', 'contatos', 'auth_secure_51',
  $$FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor())$$);

SELECT ops.safe_create_policy('zapp', 'contatos', 'contatos_delete',
  $$FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = (select auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))$$);

SELECT ops.safe_create_policy('zapp', 'contatos', 'contatos_update',
  $$FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = (select auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'supervisor'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = (select auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))$$);

SELECT ops.safe_create_policy('zapp', 'contatos', 'contatos_write',
  $$FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = (select auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))$$);

SELECT ops.safe_create_policy('zapp', 'empresas', 'empresas_delete',
  $$FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = (select auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))$$);

SELECT ops.safe_create_policy('zapp', 'empresas', 'empresas_write',
  $$FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = (select auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))$$);

SELECT ops.safe_create_policy('zapp', 'webhook_events_processed', 'service role manages webhook_events_processed',
  $$FOR ALL TO service_role USING (true) WITH CHECK (true)$$);

SELECT ops.safe_create_policy('zapp', 'profiles', 'service_role_all_profiles',
  $$FOR ALL TO service_role USING (true) WITH CHECK (true)$$);

SELECT ops.safe_create_policy('zapp', 'profiles', 'user_insert_own_profile',
  $$FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id)$$);

SELECT ops.safe_create_policy('zapp', 'profiles', 'user_update_own_profile',
  $$FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id)$$);

SELECT ops.safe_create_policy('zapp', 'user_roles', 'user_roles_admin_manage',
  $$FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = (select auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'dev'::text]))) WITH CHECK (EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = (select auth.uid()) AND p.role = ANY (ARRAY['admin'::text, 'dev'::text])))$$);
