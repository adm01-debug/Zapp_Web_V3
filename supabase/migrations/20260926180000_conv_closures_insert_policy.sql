-- 20260926180000 — Habilita INSERT em zapp.conversation_closures para authenticated
-- Rollback: DROP POLICY IF EXISTS conv_closures_insert ON zapp.conversation_closures;
--
-- PROBLEMA (auditoria exaustiva de 2026-09-26):
--   zapp.conversation_closures estava com RLS habilitado (relrowsecurity = true) e
--   apenas DUAS policies:
--     - service_full_access  (ALL,    service_role)
--     - conv_closures_select (SELECT, authenticated)
--   Nao havia policy de INSERT para `authenticated`. O encerramento de conversa
--   (CloseConversationDialog) faz INSERT com a anon key + JWT do usuario, ou seja
--   role `authenticated` — logo o INSERT era NEGADO por RLS (42501).
--
--   Efeito em cascata: o `if (!error)` do dialog nunca abria, entao nada do
--   encerramento acontecia (sem closure, sem evento 'close', sem atualizacao do
--   overlay de tickets) e a aba "Resolvidos" ficava permanentemente vazia —
--   conversation_closures tinha 0 linhas em producao.
--
-- CORRECAO:
--   Adiciona a policy de INSERT que faltava, com o MESMO predicado ja usado pela
--   policy de SELECT desta tabela e pela policy de INSERT da tabela irma
--   zapp.conversation_events (conv_events_insert) — o guard canonico de
--   visibilidade de contato. Assim, quem ja pode LER o encerramento de um contato
--   passa a poder REGISTRAR o encerramento dele; nada e ampliado alem do escopo
--   de contatos que o usuario ja enxerga.

DROP POLICY IF EXISTS conv_closures_insert ON zapp.conversation_closures;

CREATE POLICY conv_closures_insert ON zapp.conversation_closures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    zapp.is_contact_visible_to_user(contact_id, (SELECT auth.uid()))
    OR zapp.is_admin_or_supervisor((SELECT auth.uid()))
  );
