-- SEC: REVOKE EXECUTE de funções SECURITY DEFINER sem cobertura anterior
--
-- NOTA DE VERSAO: este arquivo foi renumerado (era 202609020[45]0000) porque
-- aqueles prefixos ja estavam ocupados na main e pelo PR #1483. O prefixo de
-- 14 digitos e a PRIMARY KEY de supabase_migrations.schema_migrations: dois
-- arquivos com a mesma versao fazem o segundo ser ignorado em silencio. Nao
-- renumerar de volta.
--
-- Auditoria de 2026-09-02 identificou cinco funções SECURITY DEFINER cujos
-- GRANTs implícitos a PUBLIC (herdados na criação) nunca foram revogados por
-- nenhuma migration anterior:
--
--   evo.fn_update_instance_health() FICOU DE FORA (2026-09-03): o gate E42
--      (evo-ddl-gate) barra DDL novo no schema evo, que e fronteira de
--      propriedade da Evolution (ADR-DB-002 — infra no repo evolution-stack).
--      O REVOKE dela nao pertence a este repo; deve ser aberto no
--      adm01-debug/evolution-stack, que e o dono do schema. Mantido aqui apenas
--      como registro do achado da auditoria.
--
--   1. artes.handle_new_auth_user()      — trigger SECURITY DEFINER no schema
--      artes; schema artes ausente de todos os loops de revoke anteriores.
--
--   2. artes.garantir_auth_tokens_nao_null() — idem.
--
--   3. zapp.messages_instead_of_delete() — criada hoje em 20260902010000 para
--      corrigir bypass de RLS via view zapp.messages; não tinha REVOKE.
--
--   4. zapp.messages_update_trigger()    — idem. Nota: o squash canônico
--      (linhas 12185-12187) já tinha REVOKE completo desta função; o REVOKE
--      aqui é idempotente (no-op) mas mantido por consistência com o bloco.
--
-- Sem este REVOKE qualquer role `anon` ou `authenticated` com acesso SELECT na
-- view poderia invocar as funções diretamente via RPC e contornar a verificação
-- de role implementada no corpo (SECURITY DEFINER bypassa RLS mas não EXECUTE).

-- lint:ok (funções existem; REVOKE é idempotente via IF EXISTS pattern implícito)

REVOKE ALL ON FUNCTION artes.handle_new_auth_user()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION artes.garantir_auth_tokens_nao_null()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.messages_instead_of_delete()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION zapp.messages_update_trigger()
  FROM PUBLIC, anon, authenticated;
