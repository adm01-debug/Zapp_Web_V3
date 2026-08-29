import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);
const scriptPath = resolve(repoRoot, 'scripts/generate-schema-catalog.mjs');
const fixturePath = resolve(repoRoot, 'scripts/lib/__fixtures__/schema-catalog-fixture.types.ts');

test('generate-schema-catalog preserva colunas críticas e normaliza Returns inline', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'schema-catalog-test-'));
  const outFile = join(outDir, 'schema-catalog.json');

  execFileSync('node', [scriptPath, '--types-file', fixturePath, '--out', outFile], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const catalog = JSON.parse(readFileSync(outFile, 'utf8'));
  const zapp = catalog.schemas.zapp;

  assert.equal(zapp.Functions.current_user_role.overloads[0].returns, 'string');
  assert.equal(zapp.Functions.decrypt_gmail_token.overloads[0].returns, 'string');
  assert.equal(zapp.Functions.encrypt_gmail_token.overloads[0].returns, 'string');
  assert.equal(zapp.Functions.rpc_get_gmail_health_summary.overload_count, 2);
  assert.equal(zapp.Functions.rpc_get_gmail_health_summary.overloads[0].returns, 'Json');
  assert.equal(zapp.Functions.rpc_get_gmail_health_summary.overloads[1].returns, 'Json');
  assert.ok(zapp.Views.gmail_accounts.row_columns.some((column) => column.name === 'history_id'));
  assert.ok(zapp.Views.gmail_accounts.row_columns.some((column) => column.name === 'watch_expiration'));
  assert.ok(zapp.Views.contacts.row_columns.some((column) => column.name === 'last_seen_at'));
  assert.ok(zapp.Views.contacts.row_columns.some((column) => column.name === 'workspace_id'));
});

test('generate-schema-catalog compara catálogos ignorando source quando solicitado', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'schema-catalog-compare-'));
  const outFile = join(outDir, 'schema-catalog.json');
  const compareFile = join(outDir, 'schema-catalog.compare.json');

  execFileSync('node', [scriptPath, '--types-file', fixturePath, '--out', outFile], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const catalog = JSON.parse(readFileSync(outFile, 'utf8'));
  catalog.source = {
    kind: 'postgres-meta',
    url: 'https://example.invalid/pg/generators/typescript',
    types_sha1: catalog.source.types_sha1,
  };
  writeFileSync(compareFile, JSON.stringify(catalog, null, 2) + '\n');

  execFileSync(
    'node',
    [
      scriptPath,
      '--types-file',
      fixturePath,
      '--out',
      outFile,
      '--compare-file',
      compareFile,
      '--ignore-source',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
});
