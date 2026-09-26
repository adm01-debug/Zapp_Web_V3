-- Fecha o acesso de `authenticated` a RPCs SECURITY DEFINER que apagam PII ou
-- hard-deletam contatos, sem nenhuma checagem de autorizacao no corpo e sem
-- nenhum chamador no codigo do app.
--
-- Evidencia (verificacao ao vivo do catalogo + exploracao empirica, 2026-09-26):
--
--   zapp.anonymize_contacts_batch(uuid[])   SECURITY DEFINER, owner postgres,
--     EXECUTE para authenticated, corpo SEM auth.uid(), SEM
--     is_admin_or_supervisor() e SEM is_contact_visible_to_user(). Sobrescreve
--     full_name, phone_number, email, push_name, profile_picture_url, company,
--     role_title, instance_name, notes e raw_data com 'REDACTED' — nos ids que
--     o chamador escolher.
--
--   zapp.fn_add_label_to_contact(uuid, text)  idem, escreve labels em qualquer
--     contato. Exploracao PROVADA por impersonacao (SET LOCAL ROLE
--     authenticated + request.jwt.claims de um agent comum): a chamada executou
--     em contato atribuido a OUTRO agent, sem erro de permissao.
--
--   zapp.delete_contact_completely(uuid)     idem. O unico auth.uid() do corpo e
--     o campo de auditoria performed_by, nao uma checagem. Hoje a funcao falha
--     por schema (coluna workspace_id inexistente em zapp.evolution_contacts),
--     entao o revoke aqui e antecipacao defensiva: se alguem consertar a coluna,
--     a funcao volta a ser destrutiva e ja estara fechada.
--
-- Nenhuma das tres tem chamador: 0 referencias em src/ e supabase/functions/,
-- e pg_cron roda como owner (nao como authenticated), logo jobs nao sao
-- afetados. E o oposto de zapp.rpc_upsert_contact, que E usado pelo front
-- (src/hooks/useAutomation*.ts) e por isso NAO e revogada aqui — ela precisa de
-- guarda que preserve o uso legitimo, em migration propria.
--
-- Revogar de PUBLIC importa: o privilegio padrao de uma funcao nasce concedido a
-- PUBLIC, entao `anon` e `authenticated` herdam EXECUTE mesmo sem GRANT
-- explicito. Revogar so de `authenticated` deixaria o furo aberto para `anon`.
--
-- Rollback: GRANT EXECUTE ON FUNCTION <assinatura> TO authenticated;

REVOKE EXECUTE ON FUNCTION zapp.anonymize_contacts_batch(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_add_label_to_contact(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zapp.delete_contact_completely(uuid) FROM PUBLIC, anon, authenticated;
