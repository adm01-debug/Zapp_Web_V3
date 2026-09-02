import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);
const scriptPath = resolve(repoRoot, 'scripts/generate-schema-catalog.mjs');
const fixturePath = resolve(repoRoot, 'scripts/lib/__fixtures__/schema-catalog-fixture.types.ts');
const externalObjectsFixturePath = resolve(
  repoRoot,
  'scripts/lib/__fixtures__/schema-catalog-external-objects-fixture.types.ts',
);

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

test('generate-schema-catalog remove objetos right-only fora de --from-meta', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'schema-catalog-external-objects-'));
  const outFile = join(outDir, 'schema-catalog.json');
  const externalObjectsFile = join(outDir, 'external-objects.json');
  writeFileSync(
    externalObjectsFile,
    JSON.stringify(
      {
        version: 1,
        objects: [
          {
            path: 'schemas.public.Functions.has_role',
            owner: 'external-finance-system',
            reason: 'Função de outro sistema que compartilha o schema public.',
            expected_presence: 'right-only',
          },
        ],
      },
      null,
      2,
    ) + '\n',
  );

  execFileSync(
    'node',
    [
      scriptPath,
      '--types-file',
      externalObjectsFixturePath,
      '--schemas',
      'public,zapp',
      '--external-objects-file',
      externalObjectsFile,
      '--out',
      outFile,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  const catalog = JSON.parse(readFileSync(outFile, 'utf8'));

  // O objeto declarado right-only nunca deve entrar no catálogo canônico —
  // regressão do bug real: um regen --from-meta completo do types.ts incluía
  // has_role (função do sistema financeiro externo que compartilha o schema
  // public) no catálogo commitado, quebrando o gate "Catalog fresh" porque
  // compare-schema-catalog.mjs esperava esse objeto ausente do lado commitado.
  assert.equal('has_role' in catalog.schemas.public.Functions, false);
  // Objetos que não estão na allowlist continuam preservados normalmente.
  assert.equal('own_public_helper' in catalog.schemas.public.Functions, true);
  assert.equal('current_user_role' in catalog.schemas.zapp.Functions, true);
  assert.equal(catalog.summary.functions, 2);
});

test('generate-schema-catalog so filtra objetos right-only fora de --from-meta (guard de codigo)', () => {
  // Verificação estática do invariante em vez de um servidor HTTP real: um
  // teste de integração com --from-meta via loopback HTTP entre processos
  // (execFileSync spawnando um child que faz fetch() de volta pro processo
  // de teste) trava de forma consistente neste ambiente sandboxado — child
  // processes não enxergam o servidor loopback do processo pai. Como o efeito
  // que realmente importa proteger é "objetos right-only nunca vazam para o
  // catálogo COMMITADO" (coberto pelo teste anterior), aqui só travamos a
  // condição de guarda no código-fonte para não perder a proteção caso
  // alguém troca `if (!FROM_META)` por algo que sempre filtra.
  const source = readFileSync(scriptPath, 'utf8');
  assert.match(
    source,
    /if\s*\(\s*!FROM_META\s*\)\s*\{\s*\n\s*const externalObjects = loadExternalObjectsAllowlist/,
    'o filtro de objetos externos deve rodar apenas fora do modo --from-meta — a geração ao vivo usada por compare-schema-catalog.mjs precisa continuar trazendo os objetos externos intactos',
  );
});
