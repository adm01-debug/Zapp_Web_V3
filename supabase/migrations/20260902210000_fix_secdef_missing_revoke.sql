-- SEC: REVOKE EXECUTE de funções SECURITY DEFINER sem cobertura anterior
--
-- Auditoria de 2026-09-02 identificou cinco funções SECURITY DEFINER cujos
-- GRANTs implícitos a PUBLIC (herdados na criação) nunca foram revogados por
-- nenhuma migration anterior:
--
--   1. evo.fn_update_instance_health()   — disparada por cron */10 min;
--      não estava coberta por 20260804150000 (loop só percorre schemas zapp/auth)
--      nem por 20260808150000 (lista de funções hardcoded sem esta).
--
--   2. artes.handle_new_auth_user()      — trigger SECURITY DEFINER no schema
--      artes; schema artes ausente de todos os loops de revoke anteriores.
--
--   3. artes.garantir_auth_tokens_nao_null() — idem.
--
--   4. zapp.messages_instead_of_delete() — criada hoje em 20260902010000 para
--      corrigir bypass de RLS via view zapp.messages; não tinha REVOKE.
--
--   5. zapp.messages_update_trigger()    — idem. Nota: o squash canônico
--      (linhas 12185-12187) já tinha REVOKE completo desta função; o REVOKE
--      aqui é idempotente (no-op) mas mantido por consistência com o bloco.
--
-- Sem este REVOKE qualquer role `anon` ou `authenticated` com acesso SELECT na
-- view poderia invocar as funções diretamente via RPC e contornar a verificação
-- de role implementada no corpo (SECURITY DEFINER bypassa RLS mas não EXECUTE).

-- lint:ok (funções existem; REVOKE é idempotente via IF EXISTS pattern implícito)

REVOKE ALL ON FUNCTION evo.fn_update_instance_health()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION artes.handle_new_auth_user()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION artes.garantir_auth_tokens_nao_null()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.messages_instead_of_delete()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.messages_update_trigger()
  FROM PUBLIC, anon, authenticated;
