-- ============================================================
-- 20260830180000_e2e_fix_extend_app_role_enum.sql
-- Título: estende public.app_role com os papéis do módulo empresas/user_empresas
-- Versão: 20260830180000 · Data: 2026-08-30 · Autor: sessão de chat (materializado retroativamente 2026-09-01)
-- Tema único: valores de enum para RBAC do módulo multi-empresa (public.user_empresas.role)
-- Objetos afetados: public.app_role (enum) — NÃO afeta zapp.app_role (enum distinto,
--   usado por zapp.user_roles; permanece só com admin/manager/supervisor/agent/
--   special_agent/dev — confirmado via pg_enum em 2026-09-01)
-- Idempotência: ALTER TYPE ... ADD VALUE IF NOT EXISTS
-- Rollback: não suportado pelo Postgres (ALTER TYPE ... DROP VALUE não existe);
--   se necessário, recriar o tipo sem os valores e migrar as linhas de
--   public.user_empresas.role primeiro.
-- Refs: aplicada originalmente via MCP SQL direto em 2026-08-30 (registrada em
--       supabase_migrations.schema_migrations), sem arquivo espelho no repo até esta
--       materialização (auditoria de sessão 2026-09-01). Motivada pelos testes e2e
--       do módulo financeiro multi-empresa (ver 20260830180300_e2e_fix_finance_
--       core_empresas_user_empresas.sql, aplicada 3min depois).
-- ============================================================

-- ALTER TYPE ... ADD VALUE não pode rodar dentro do mesmo bloco de transação em
-- que o valor novo é usado — este arquivo só adiciona os valores, sem uso.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operacional';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'contador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operator';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
