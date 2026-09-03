-- PATCH 3 (SQL) — Índices de boot de auth
--
-- Referenciado em commit e16bb73 como "PATCH 3 (SQL) — será aplicado via Supabase MCP
-- separadamente", mas nunca aplicado nas migrations do repo. Aplicado aqui em 2026-09-02.
--
-- PROBLEMA:
--   Durante boot de auth, AuthProvider dispara duas queries sequenciais:
--     SELECT role FROM zapp.user_roles WHERE user_id = $1
--     SELECT permission_id, ... FROM zapp.role_permissions WHERE role = ANY($1)
--
--   Sem índice em user_roles.user_id, o planner faz seq scan. Com RLS ativo
--   (policy usa user_id = auth.uid()), a ausência de índice força seq scan
--   mesmo quando a tabela cresce para centenas de linhas (multi-tenant future).
--
--   role_permissions tem índice em (role) via idx_role_permissions_role, mas
--   a FK para permissions precisa de índice em permission_id para o JOIN.
--
-- FIX:
--   1. idx_user_roles_user_id — acelera lookup de roles por usuário (O(log n))
--   2. idx_role_permissions_permission_id — acelera JOIN permission_id → permissions
--
-- Ambos são idempotentes (IF NOT EXISTS).

-- 1. Lookup de roles por user_id (consulta central do boot de auth)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON zapp.user_roles (user_id);

-- 2. JOIN role_permissions → permissions (resolução de nomes de permissão)
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id
  ON zapp.role_permissions (permission_id);
