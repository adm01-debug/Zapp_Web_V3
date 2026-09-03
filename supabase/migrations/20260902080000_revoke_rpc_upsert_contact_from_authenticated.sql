-- Achado de auditoria (varredura de RPCs SECURITY DEFINER na mesma classe do bug
-- fn_sicoob_bridge_ingest_message, sessao 2026-09-02): zapp.rpc_upsert_contact e
-- SECURITY DEFINER e tinha EXECUTE aberto para `authenticated` -- ou seja, QUALQUER
-- usuario logado do Zapp (qualquer um dos ~19 perfis, sem precisar ser admin/supervisor)
-- podia chamar a RPC diretamente via PostgREST (POST /rest/v1/rpc/rpc_upsert_contact)
-- e sobrescrever lead_status, lead_score, assigned_to, tags, notes, phone_number, email
-- e company de QUALQUER contato/lead existente (ON CONFLICT(remote_jid) DO UPDATE),
-- sem passar pela validacao HMAC/segredo que os webhooks (Evolution/WhatsApp Cloud)
-- exigem antes de chamar essa RPC. A guarda interna (zapp.fn_require_app_user) so
-- confirma "e algum usuario/membro do app", nao verifica nenhuma relacao com o
-- contato-alvo -- ao contrario de zapp.rpc_insert_message, que exige visibilidade
-- real do contato ou papel admin/supervisor.
--
-- Confirmado ao vivo (2026-09-02) via has_function_privilege('authenticated', ...) = true
-- antes deste fix -- vulnerabilidade real e ativa, mesma classe do achado ja corrigido
-- em fn_sicoob_bridge_ingest_message (migration 20260902050000).
--
-- Unico caller real confirmado no repo e supabase/functions/whatsapp-cloud-webhook/index.ts,
-- via `externalClient` -- uma chave de API estatica (anon ou service_role, nunca
-- "authenticated": esse role so existe via JWT de sessao de usuario, nao chave de API).
-- Como `anon` ja nao tem EXECUTE nesta funcao, revogar `authenticated` nao pode quebrar
-- esse caller em nenhum dos dois cenarios de chave configurada.
REVOKE EXECUTE ON FUNCTION zapp.rpc_upsert_contact(
  text, text, text, text, text, text, text, text, text, text, integer, text, text[], text
) FROM authenticated;
