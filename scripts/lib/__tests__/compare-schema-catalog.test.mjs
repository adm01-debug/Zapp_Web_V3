import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);
const scriptPath = resolve(repoRoot, 'scripts/compare-schema-catalog.mjs');

test('compare-schema-catalog ignora source quando solicitado', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'schema-catalog-compare-script-'));
  const leftFile = join(outDir, 'left.json');
  const rightFile = join(outDir, 'right.json');

  const left = {
    schema_catalog_version: 1,
    source: { kind: 'types-file', path: 'src/integrations/supabase/types.ts' },
    summary: { schemas: 1, tables: 0, views: 0, functions: 1, enums: 0, composite_types: 0 },
    schemas: {
      zapp: {
        Functions: {
          current_user_role: {
            overload_count: 1,
            overloads: [{ args: [], returns: 'string' }],
          },
        },
      },
    },
  };

  const right = {
    ...left,
    source: { kind: 'postgres-meta', url: 'https://example.invalid/pg/generators/typescript' },
  };

  writeFileSync(leftFile, JSON.stringify(left, null, 2) + '\n');
  writeFileSync(rightFile, JSON.stringify(right, null, 2) + '\n');

  const stdout = execFileSync(
    'node',
    [scriptPath, '--left', leftFile, '--right', rightFile, '--ignore-source'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.match(stdout, /ignorando source/);
});
