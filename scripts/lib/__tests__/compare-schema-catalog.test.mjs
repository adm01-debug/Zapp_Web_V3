import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);
const scriptPath = resolve(repoRoot, 'scripts/compare-schema-catalog.mjs');

function externalEntry(path, expectedPresence) {
  return {
    path,
    owner: 'external-finance-system',
    reason: 'Objeto externo usado apenas pelo teste do guard.',
    expected_presence: expectedPresence,
  };
}

function createCatalogPair() {
  const sharedZappFunction = {
    overload_count: 1,
    overloads: [{ args: [], returns: 'string' }],
  };
  const externalFunction = {
    overload_count: 1,
    overloads: [{ args: [], returns: 'boolean' }],
  };
  const externalTable = {
    row_columns: [{ name: 'id', type: 'string' }],
    insert_columns: [{ name: 'id', type: 'string' }],
    update_columns: [{ name: 'id', type: 'string' }],
    relationship_count: 0,
  };
  const externalView = {
    row_columns: [{ name: 'id', type: 'string' }],
    relationship_count: 0,
  };

  const left = {
    schema_catalog_version: 1,
    source: { kind: 'types-file' },
    summary: { schemas: 2, tables: 0, views: 1, functions: 1, enums: 0, composite_types: 0 },
    schemas: {
      public: {
        Tables: {},
        Views: { empresas: externalView },
        Functions: {},
        Enums: {},
        CompositeTypes: {},
      },
      zapp: {
        Tables: {},
        Views: {},
        Functions: { current_user_role: sharedZappFunction },
        Enums: {},
        CompositeTypes: {},
      },
    },
  };

  const right = {
    schema_catalog_version: 1,
    source: { kind: 'postgres-meta' },
    summary: { schemas: 2, tables: 2, views: 1, functions: 3, enums: 0, composite_types: 0 },
    schemas: {
      public: {
        Tables: { empresas: externalTable, user_empresas: externalTable },
        Views: { empresas_zapp_legacy: externalView },
        Functions: {
          has_role: externalFunction,
          has_role_in_empresa: externalFunction,
        },
        Enums: {},
        CompositeTypes: {},
      },
      zapp: {
        Tables: {},
        Views: {},
        Functions: { current_user_role: sharedZappFunction },
        Enums: {},
        CompositeTypes: {},
      },
    },
  };

  return { left, right };
}

function writeScenario(left, right, objects) {
  const outDir = mkdtempSync(join(tmpdir(), 'schema-catalog-compare-script-'));
  const leftFile = join(outDir, 'left.json');
  const rightFile = join(outDir, 'right.json');
  const externalObjectsFile = join(outDir, 'external-objects.json');
  writeFileSync(leftFile, JSON.stringify(left, null, 2) + '\n');
  writeFileSync(rightFile, JSON.stringify(right, null, 2) + '\n');
  writeFileSync(
    externalObjectsFile,
    JSON.stringify({ version: 1, objects }, null, 2) + '\n',
  );
  return { leftFile, rightFile, externalObjectsFile };
}

function runScenario(files) {
  return spawnSync(
    process.execPath,
    [
      scriptPath,
      '--left',
      files.leftFile,
      '--right',
      files.rightFile,
      '--ignore-source',
      '--external-objects-file',
      files.externalObjectsFile,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

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

test('compare-schema-catalog ignora somente objetos externos com presença declarada', () => {
  const { left, right } = createCatalogPair();
  const files = writeScenario(left, right, [
    externalEntry('schemas.public.Functions.has_role', 'right-only'),
    externalEntry('schemas.public.Functions.has_role_in_empresa', 'right-only'),
    externalEntry('schemas.public.Tables.empresas', 'right-only'),
    externalEntry('schemas.public.Tables.user_empresas', 'right-only'),
    externalEntry('schemas.public.Views.empresas', 'left-only'),
    externalEntry('schemas.public.Views.empresas_zapp_legacy', 'right-only'),
  ]);

  const result = runScenario(files);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ignorando 6 objetos externos declarados/);
});

test('compare-schema-catalog continua bloqueando drift não listado', () => {
  const { left, right } = createCatalogPair();
  right.schemas.zapp.Functions.unlisted_drift = {
    overload_count: 1,
    overloads: [{ args: [], returns: 'number' }],
  };
  const files = writeScenario(left, right, [
    externalEntry('schemas.public.Views.empresas', 'left-only'),
  ]);

  const result = runScenario(files);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Schema catalog stale/);
});

test('compare-schema-catalog falha se a presença do objeto externo mudar', () => {
  const { left, right } = createCatalogPair();
  left.schemas.public.Functions.has_role = right.schemas.public.Functions.has_role;
  const files = writeScenario(left, right, [
    externalEntry('schemas.public.Functions.has_role', 'right-only'),
  ]);

  const result = runScenario(files);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Presença de objeto externo inesperada/);
  assert.match(result.stderr, /esperado right-only, encontrado both/);
});

test('compare-schema-catalog rejeita exclusão fora de schemas.public', () => {
  const { left, right } = createCatalogPair();
  const files = writeScenario(left, right, [
    externalEntry('schemas.zapp.Functions.current_user_role', 'both'),
  ]);

  const result = runScenario(files);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Escopo externo inválido/);
  assert.match(result.stderr, /schemas\.public/);
});
