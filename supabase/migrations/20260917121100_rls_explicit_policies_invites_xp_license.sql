-- Migration: rls_explicit_policies_invites_xp_license
-- Data: 2026-09-06 · Re-versionada 2026-09-17 (era 20260906130000)
-- Re-versionamento: irmãs colidentes de 20260906130000 eram puladas para sempre
--   pelo aplicador (registro por versão em supabase_migrations.schema_migrations).
-- Correções do corpo (nunca havia aplicado — primeira aplicação efetiva):
--   (1) DROP POLICY IF EXISTS antes de cada CREATE (idempotência);
--   (2) 'superadmin' NÃO existe no enum zapp.app_role
--       (admin|manager|supervisor|agent|special_agent|dev) → IN ('admin','dev');
--   (3) xp_transactions_own_select usa zapp.get_profile_id_for_user(auth.uid())
--       (profiles.id ≠ auth.users.id — mesmo padrão do fix 20260906140000);
--   (4) zapp.user_roles referencia auth.users por user_id (não existe profile_id).
-- Auditoria 22D 2026-09-05: 3 tabelas RLS-enabled com zero policies → tornar
-- explícito, adicionando policies de acordo com o modelo de acesso de cada tabela.

-- ─── zapp.invites ─────────────────────────────────────────────────────────────
-- Modelo de acesso: admin cria convites (via RPC invite_user que usa security definer);
-- usuário anônimo valida o token dele (via RPC accept_invite, security definer).
-- Acesso direto à tabela: somente admins autenticados lêem; escrita apenas via RPC.

DROP POLICY IF EXISTS "invites_admin_select" ON zapp.invites;
CREATE POLICY "invites_admin_select" ON zapp.invites
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'dev')
    )
  );

-- INSERT/UPDATE/DELETE são feitos exclusivamente pelas funções SECURITY DEFINER
-- (invite_user, accept_invite). Sem policy → deny-all via RLS para DML direto.

-- ─── zapp.xp_transactions ─────────────────────────────────────────────────────
-- Modelo de acesso: ledger imutável de XP. Usuário vê próprias transações;
-- admin vê todas. Escrita apenas via RPC grant_xp (SECURITY DEFINER).

DROP POLICY IF EXISTS "xp_transactions_own_select" ON zapp.xp_transactions;
CREATE POLICY "xp_transactions_own_select" ON zapp.xp_transactions
  FOR SELECT
  TO authenticated
  USING (profile_id = zapp.get_profile_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "xp_transactions_admin_select" ON zapp.xp_transactions;
CREATE POLICY "xp_transactions_admin_select" ON zapp.xp_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'dev')
    )
  );

-- DML direto bloqueado (escrita apenas via grant_xp SECURITY DEFINER).

-- ─── zapp.license_heartbeat_log ───────────────────────────────────────────────
-- Modelo de acesso: escrita por cron (service_role); leitura por ops/admin.
-- Service_role bypassa RLS; para authenticated: somente admins.

DROP POLICY IF EXISTS "license_heartbeat_admin_select" ON zapp.license_heartbeat_log;
CREATE POLICY "license_heartbeat_admin_select" ON zapp.license_heartbeat_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'dev')
    )
  );

-- Deny-all explícito para DML via authenticated (service_role bypassa RLS).
