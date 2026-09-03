-- lint:ok — DROP+CREATE POLICY deliberado: ops.safe_create_policy() não cobre
-- este caso (é preciso DERRUBAR as policies FOR ALL auth_secure_* para
-- substituí-las por policies por comando; a função é create-se-não-existe).
--
-- Título: fecha bypass de DELETE em 8 tabelas de configuração (RLS)
-- Data: 2026-09-02 · Autor: auditoria 22 dimensões (sessão remota)
-- Tema único: RLS — separar policies FOR ALL em policies por comando
-- Objetos afetados: policies de zapp.{allowed_countries,auto_close_config,
--   away_messages,business_hours,sales_pipeline_stages,automations,
--   automation_rules,custom_emojis} (roles authenticated; service_role intocado)
-- Idempotência: total — todos os DROPs (antigas E novas) usam IF EXISTS antes
--   de cada CREATE; reaplicar produz o mesmo estado final
-- Rollback: para cada tabela, DROP das 4 policies novas e recriação da
--   original, ex.:
--     DROP POLICY IF EXISTS allowed_countries_select ON zapp.allowed_countries;
--     DROP POLICY IF EXISTS allowed_countries_insert ON zapp.allowed_countries;
--     DROP POLICY IF EXISTS allowed_countries_update ON zapp.allowed_countries;
--     DROP POLICY IF EXISTS allowed_countries_delete ON zapp.allowed_countries;
--     CREATE POLICY auth_secure_27 ON zapp.allowed_countries FOR ALL
--       TO authenticated USING (true) WITH CHECK (zapp.is_admin_or_supervisor());
--   (mesmo padrão para auth_secure_31/33/34/35/37/56/98, com o WITH CHECK
--   original de cada uma — ver snapshot zapp_schema_snapshot.sql)
--
-- SEC: fecha bypass de DELETE em 8 tabelas de configuração (RLS)
--
-- Auditoria 2026-09-02 (22 dimensões): as policies auth_secure_* dessas tabelas
-- eram FOR ALL com USING (true) + WITH CHECK restritivo. Em RLS, WITH CHECK
-- não se aplica a DELETE — só o USING. Efeito real: qualquer role authenticated
-- podia DELETAR qualquer linha de automations, automation_rules, business_hours,
-- away_messages, allowed_countries, auto_close_config, sales_pipeline_stages e
-- custom_emojis (inclusive de outros usuários), embora INSERT/UPDATE já fossem
-- barrados pelo WITH CHECK.
--
-- Correção de menor diff: separar a policy ALL em policies por comando,
-- preservando o comportamento atual de SELECT (aberto a authenticated),
-- INSERT e UPDATE (mesmas expressões do WITH CHECK vigente) e restringindo
-- DELETE à mesma expressão da escrita. As policies service_full_access/svc_rls
-- (service_role) não são tocadas.
--
-- INSERT mantém as mesmas expressões; DELETE passa a exigir o mesmo privilégio
-- que a escrita sempre exigiu. Mudança de semântica documentada no UPDATE de
-- não-privilegiados: antes a linha era visível (USING true) e o WITH CHECK
-- falhava com ERRO 42501; agora a linha fica invisível ao UPDATE e o resultado
-- é 0 linhas SEM erro — mutations do front que só checam `error` podem exibir
-- toast de sucesso sem efeito (checar linhas afetadas ao endurecer telas).

BEGIN;

-- Idempotência: derruba as policies novas caso já existam (re-execução limpa)
DO $$
DECLARE t text; cmd text;
BEGIN
  FOREACH t IN ARRAY ARRAY['allowed_countries','auto_close_config','away_messages',
    'business_hours','sales_pipeline_stages','automations','automation_rules','custom_emojis'] LOOP
    FOREACH cmd IN ARRAY ARRAY['select','insert','update','delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON zapp.%I', t || '_' || cmd, t);
    END LOOP;
  END LOOP;
END $$;

-- ── 6 tabelas de configuração: escrita admin/supervisor ─────────────────────

-- allowed_countries
DROP POLICY IF EXISTS auth_secure_27 ON zapp.allowed_countries;
CREATE POLICY allowed_countries_select ON zapp.allowed_countries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY allowed_countries_insert ON zapp.allowed_countries
  FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY allowed_countries_update ON zapp.allowed_countries
  FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY allowed_countries_delete ON zapp.allowed_countries
  FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor());

-- auto_close_config
DROP POLICY IF EXISTS auth_secure_31 ON zapp.auto_close_config;
CREATE POLICY auto_close_config_select ON zapp.auto_close_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auto_close_config_insert ON zapp.auto_close_config
  FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY auto_close_config_update ON zapp.auto_close_config
  FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY auto_close_config_delete ON zapp.auto_close_config
  FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor());

-- away_messages
DROP POLICY IF EXISTS auth_secure_35 ON zapp.away_messages;
CREATE POLICY away_messages_select ON zapp.away_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY away_messages_insert ON zapp.away_messages
  FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY away_messages_update ON zapp.away_messages
  FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY away_messages_delete ON zapp.away_messages
  FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor());

-- business_hours
DROP POLICY IF EXISTS auth_secure_37 ON zapp.business_hours;
CREATE POLICY business_hours_select ON zapp.business_hours
  FOR SELECT TO authenticated USING (true);
CREATE POLICY business_hours_insert ON zapp.business_hours
  FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY business_hours_update ON zapp.business_hours
  FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY business_hours_delete ON zapp.business_hours
  FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor());

-- sales_pipeline_stages
DROP POLICY IF EXISTS auth_secure_98 ON zapp.sales_pipeline_stages;
CREATE POLICY sales_pipeline_stages_select ON zapp.sales_pipeline_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY sales_pipeline_stages_insert ON zapp.sales_pipeline_stages
  FOR INSERT TO authenticated WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY sales_pipeline_stages_update ON zapp.sales_pipeline_stages
  FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());
CREATE POLICY sales_pipeline_stages_delete ON zapp.sales_pipeline_stages
  FOR DELETE TO authenticated USING (zapp.is_admin_or_supervisor());

-- ── automations / automation_rules: escrita dono-ou-admin ───────────────────

DROP POLICY IF EXISTS auth_secure_34 ON zapp.automations;
CREATE POLICY automations_select ON zapp.automations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY automations_insert ON zapp.automations
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());
CREATE POLICY automations_update ON zapp.automations
  FOR UPDATE TO authenticated
  USING ((created_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor())
  WITH CHECK ((created_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());
CREATE POLICY automations_delete ON zapp.automations
  FOR DELETE TO authenticated
  USING ((created_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS auth_secure_33 ON zapp.automation_rules;
CREATE POLICY automation_rules_select ON zapp.automation_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY automation_rules_insert ON zapp.automation_rules
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());
CREATE POLICY automation_rules_update ON zapp.automation_rules
  FOR UPDATE TO authenticated
  USING ((created_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor())
  WITH CHECK ((created_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());
CREATE POLICY automation_rules_delete ON zapp.automation_rules
  FOR DELETE TO authenticated
  USING ((created_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());

-- ── custom_emojis: escrita dono-ou-admin em UPDATE e DELETE ─────────────────
-- (revisão adversarial 2026-09-03: USING(true) no UPDATE permitia sequestro de
-- propriedade — UPDATE uploaded_by=auth.uid() passa no WITH CHECK por avaliar a
-- linha NOVA, e o DELETE seguinte vira "do dono". O USING(true) também não
-- preservava nada: os updates do front em emoji alheio já falhavam no WITH CHECK.)

DROP POLICY IF EXISTS auth_secure_56 ON zapp.custom_emojis;
CREATE POLICY custom_emojis_select ON zapp.custom_emojis
  FOR SELECT TO authenticated USING (true);
CREATE POLICY custom_emojis_insert ON zapp.custom_emojis
  FOR INSERT TO authenticated
  WITH CHECK ((uploaded_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());
CREATE POLICY custom_emojis_update ON zapp.custom_emojis
  FOR UPDATE TO authenticated
  USING ((uploaded_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor())
  WITH CHECK ((uploaded_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());
CREATE POLICY custom_emojis_delete ON zapp.custom_emojis
  FOR DELETE TO authenticated
  USING ((uploaded_by = (SELECT auth.uid())) OR zapp.is_admin_or_supervisor());

COMMIT;
