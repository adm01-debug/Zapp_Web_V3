-- Reverte parcialmente a migration 20260902080000: o REVOKE EXECUTE FROM authenticated
-- em zapp.rpc_upsert_contact quebrou uma feature real em producao. Achado do cubic
-- (confianca 10, review do PR #1483) confirmado ao vivo: o frontend chama esta RPC
-- diretamente com a sessao do usuario logado em 3 lugares:
--   src/hooks/useAutomationManagement.ts:294,523
--   src/hooks/useAutomations.ts:238
--   src/hooks/useAutomationSuggestions.ts:146
-- (automacao de tags/atualizacao de contato) -- a varredura que motivou o REVOKE
-- (20260902080000) so checou supabase/functions/, nao src/, e nao encontrou esses
-- callers reais.
--
-- A vulnerabilidade original (SECURITY DEFINER, EXECUTE aberto para authenticated,
-- sem verificacao de ownership/workspace sobre o remote_jid alvo -- qualquer usuario
-- logado pode sobrescrever qualquer contato) CONTINUA REAL e nao foi corrigida aqui --
-- so foi restaurado o estado anterior a esta sessao (pre-existente, nao introduzido
-- por nos). Adicionar uma guarda de autorizacao adequada (ex: exigir que o contato
-- esteja atribuido ao usuario ou visivel a ele, no padrao ja usado por
-- zapp.rpc_insert_message via zapp.is_contact_visible_to_user) requer desenho
-- cuidadoso para nao quebrar a automacao de tags em contatos novos/nao-atribuidos --
-- fica como pendencia para o dono decidir e uma sessao dedicada implementar.
GRANT EXECUTE ON FUNCTION zapp.rpc_upsert_contact(
  text, text, text, text, text, text, text, text, text, text, integer, text, text[], text
) TO authenticated;
