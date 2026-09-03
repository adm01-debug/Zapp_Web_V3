-- SEC: REVOKE EXECUTE de funções SECURITY DEFINER criadas pós-squash sem cobertura
--
-- NOTA DE VERSAO: este arquivo foi renumerado (era 202609020[45]0000) porque
-- aqueles prefixos ja estavam ocupados na main e pelo PR #1483. O prefixo de
-- 14 digitos e a PRIMARY KEY de supabase_migrations.schema_migrations: dois
-- arquivos com a mesma versao fazem o segundo ser ignorado em silencio. Nao
-- renumerar de volta.
--
-- Auditoria holística de 2026-09-02 (Agente 5) identificou funções SECURITY
-- DEFINER criadas em migrations post-squash cujos GRANTs implícitos a PUBLIC
-- não foram revogados:
--
--   1. zapp.fn_sicoob_bridge_ingest_message(...)
--      — criada em 20260902020000 (mesmo dia que 20260902210000);
--        ausente da lista explícita do REVOKE anterior. Função atômica de
--        ingress para sicoob-bridge — acesso via RPC direto por anon/authenticated
--        contornaria a validação do Bearer token que o handler implementa.
--
--   2. zapp.invite_user(text, text, text)
--      — criada em 20260818190003; cria usuários via Supabase Admin API com
--        SECURITY DEFINER. Role authenticated sem privilégio de admin não
--        deveria chamar via RPC direta (o frontend passa pelo hook React que
--        valida permissão, mas EXECUTE em PUBLIC permite bypass).
--
--   3. zapp.debug_lid_case/flow/lookup
--      — 3 funções de debug criadas em 20260818230100. Expõem dados internos
--        de lookup de instâncias. SECURITY DEFINER + sem REVOKE = qualquer
--        role authenticated pode chamar via RPC.
--
--   4. zapp.fn_purge_api_key_from_logs(text)
--      — criada em 20260819155921. Apaga dados sensíveis de logs — operação
--        privilegiada que não deve ser exposta a roles não-privilegiadas.
--
--   5. zapp.fn_validate_report_query(text)
--      — criada em 20260817290000. Recebe SQL como parâmetro text e o executa
--        (EXPLAIN ANALYZE ou equivalente). SECURITY DEFINER + input SQL =
--        superfície de ataque elevada. REVOKE obrigatório.
--
-- Todas as funções listadas têm chamadores legítimos via service_role (edge
-- functions, cron jobs, admin RPCs) que não são afetados pelo REVOKE
-- (service_role bypassa checagem de EXECUTE em SECURITY DEFINER).

-- lint:ok (funções existem nas migrations listadas acima)

REVOKE ALL ON FUNCTION zapp.fn_sicoob_bridge_ingest_message(
  text, text, text, text, text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.invite_user(text, text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.debug_lid_case(jsonb)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.debug_lid_flow(jsonb)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.debug_lid_lookup(text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.fn_purge_api_key_from_logs(text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.fn_validate_report_query(text)
  FROM PUBLIC, anon, authenticated;
