#!/usr/bin/env node
/**
 * check-mcp-exec-acl.mjs
 * ------------------------------------------------------------------
 * Assertion de CI para o contrato ACL do RPC MCP em `public`.
 *
 * Critérios:
 *   1. Deve existir ao menos um overload de `public.mcp_exec` ou `public.exec_sql`.
 *   2. `public.mcp_exec(*)` deve ser executável pelo role `mcp_exec`.
 *   3. `public.exec_sql(text)` deve ser executável pelo role `service_role`.
 *   4. Nenhum overload MCP pode estar exposto via EXECUTE para PUBLIC, anon ou authenticated.
 *
 * Observações:
 *   - Usa `psql` para falar com o banco via `SUPABASE_DB_URL` / `DATABASE_URL`.
 *   - Falha fechada quando o banco está acessível e o contrato diverge.
 *   - Mantém compatibilidade com o contrato atual (`exec_sql`) e com o alvo
 *     futuro (`mcp_exec`), evitando falso vermelho por drift de nomenclatura.
 */
import { spawnSync } from 'node:child_process';

const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';

if (!DB_URL) {
  console.error('SUPABASE_DB_URL/DATABASE_URL ausente.');
  process.exit(1);
}

function runPsql(sql) {
  const result = spawnSync(
    'psql',
    [
      DB_URL,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-F',
      '\t',
      '-c',
      sql,
    ],
    {
      encoding: 'utf8',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(stderr || `psql falhou com status ${result.status}`);
  }

  return result.stdout.trim();
}

function parseRows(raw) {
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => line.split('\t'));
}

try {
  const discovered = parseRows(runPsql(`
    SELECT p.proname, p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('mcp_exec', 'exec_sql')
    ORDER BY p.proname, signature;
  `));

  if (discovered.length === 0) {
    console.error('::error title=ACL RPC MCP::nenhum overload de public.mcp_exec/public.exec_sql foi encontrado.');
    process.exit(1);
  }

  const functionNames = new Set(discovered.map(([proname]) => proname));
  if (functionNames.has('mcp_exec')) {
    const roleExists = runPsql(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_exec');`);
    if (roleExists !== 't') {
      console.error('::error title=ACL RPC MCP::role `mcp_exec` ausente no banco, mas public.mcp_exec existe.');
      process.exit(1);
    }
  }

  const rows = parseRows(runPsql(`
    WITH target AS (
      SELECT
        p.oid,
        p.proname,
        p.oid::regprocedure::text AS signature,
        COALESCE(p.proacl, '{}'::aclitem[]) AS proacl
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('mcp_exec', 'exec_sql')
    )
    SELECT proname, signature, issue
    FROM (
      SELECT proname, signature, 'missing_mcp_exec_execute' AS issue
      FROM target
      WHERE proname = 'mcp_exec'
        AND NOT has_function_privilege('mcp_exec', oid, 'EXECUTE')

      UNION ALL

      SELECT proname, signature, 'missing_service_role_execute' AS issue
      FROM target
      WHERE proname = 'exec_sql'
        AND NOT has_function_privilege('service_role', oid, 'EXECUTE')

      UNION ALL

      SELECT DISTINCT t.proname, t.signature, 'public_execute_exposed' AS issue
      FROM target t
      JOIN LATERAL aclexplode(t.proacl) acl ON TRUE
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'

      UNION ALL

      SELECT DISTINCT t.proname, t.signature, 'anon_execute_exposed' AS issue
      FROM target t
      JOIN LATERAL aclexplode(t.proacl) acl ON TRUE
      JOIN pg_roles r ON r.oid = acl.grantee
      WHERE r.rolname = 'anon'
        AND acl.privilege_type = 'EXECUTE'

      UNION ALL

      SELECT DISTINCT t.proname, t.signature, 'authenticated_execute_exposed' AS issue
      FROM target t
      JOIN LATERAL aclexplode(t.proacl) acl ON TRUE
      JOIN pg_roles r ON r.oid = acl.grantee
      WHERE r.rolname = 'authenticated'
        AND acl.privilege_type = 'EXECUTE'
    ) q
    ORDER BY proname, signature, issue;
  `));

  if (rows.length > 0) {
    console.error('::error title=ACL RPC MCP::contrato ACL divergente para a superfície MCP em public.');
    for (const [proname, signature, issue] of rows) {
      console.error(` - ${proname} :: ${signature}: ${issue}`);
    }
    process.exit(1);
  }

  const counts = discovered.reduce((acc, [proname]) => {
    acc[proname] = (acc[proname] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([proname, count]) => `${proname}=${count}`)
    .join(', ');
  console.log(`✓ ACL do RPC MCP validada (${summary}).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
