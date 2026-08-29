import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);
const scriptPath = resolve(repoRoot, 'scripts/check-mcp-exec-acl.mjs');

function makeFakePsql(tempDir, scenario) {
  const fakePsqlPath = join(tempDir, 'psql');
  const source = `#!/usr/bin/env node
const sql = process.argv[process.argv.length - 1] || '';
const scenario = process.env.FAKE_PSQL_SCENARIO || '${scenario}';

function ok(text) {
  process.stdout.write(text);
  process.exit(0);
}

if (sql.includes("SELECT p.proname, p.oid::regprocedure::text AS signature")) {
  if (scenario === 'exec_sql_ok') ok("exec_sql\\texec_sql(text)\\n");
  if (scenario === 'mcp_exec_missing_role') ok("mcp_exec\\tmcp_exec(text)\\n");
}

if (sql.includes("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_exec')")) {
  if (scenario === 'mcp_exec_missing_role') ok("f\\n");
  ok("t\\n");
}

if (sql.includes("SELECT proname, signature, issue")) {
  ok("");
}

process.stderr.write("unexpected sql: " + sql);
process.exit(1);
`;

  writeFileSync(fakePsqlPath, source, 'utf8');
  chmodSync(fakePsqlPath, 0o755);
  return fakePsqlPath;
}

function runScenario(name) {
  const tempDir = mkdtempSync(join(tmpdir(), 'check-mcp-exec-acl-'));
  makeFakePsql(tempDir, name);
  return spawnSync('node', [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${tempDir}:${process.env.PATH || ''}`,
      SUPABASE_DB_URL: 'postgres://fake',
      FAKE_PSQL_SCENARIO: name,
    },
  });
}

test('check-mcp-exec-acl aceita o contrato atual com exec_sql protegido', () => {
  const result = runScenario('exec_sql_ok');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ACL do RPC MCP validada \(exec_sql=1\)/);
});

test('check-mcp-exec-acl falha quando mcp_exec existe sem o role mcp_exec', () => {
  const result = runScenario('mcp_exec_missing_role');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /role `mcp_exec` ausente no banco/);
});
