-- Achado do cubic (P1, review do PR #1483): zapp.fn_sicoob_bridge_ingest_message
-- é SECURITY DEFINER e tinha EXECUTE aberto para a role `authenticated` — ou
-- seja, QUALQUER usuário logado do Zapp (todo agente/atendente com conta)
-- podia chamar a RPC diretamente via PostgREST (POST /rpc/fn_sicoob_bridge_ingest_message),
-- sem passar pelo Authorization: Bearer SICOOB_BRIDGE_SECRET que
-- supabase/functions/sicoob-bridge/index.ts exige, e injetar contatos e
-- mensagens arbitrários rotulados como "Cooperado Sicoob" no CRM.
--
-- Confirmado ao vivo (2026-09-02) via has_function_privilege('authenticated',
-- 'zapp.fn_sicoob_bridge_ingest_message(...)', 'EXECUTE') = true — vulnerabilidade
-- real e ativa em produção, não hipotética.
--
-- Único caller legítimo é supabase/functions/sicoob-bridge/index.ts, que usa
-- createZappAdminClient() (service_role — sempre ignora GRANT/REVOKE, é a role
-- administrativa do Supabase). Nenhum código de app chama esta RPC como usuário
-- autenticado, então revogar não quebra nada.
REVOKE EXECUTE ON FUNCTION zapp.fn_sicoob_bridge_ingest_message(
  text, text, text, text, text, text, text, text, text, timestamptz
) FROM PUBLIC, authenticated;
