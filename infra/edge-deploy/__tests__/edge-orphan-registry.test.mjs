#!/usr/bin/env node
/**
 * edge-orphan-registry.test.mjs — teste de regressão do registry de órfãos
 * (infra/edge-deploy/deploy-edge.sh, consumido pelo gate E38/E39 edge-drift-check)
 *
 * Cobre:
 *  1. A comparação de órfão é SIMÉTRICA: arquivo não-.ts versionado em _shared
 *     (README.md, evolution-event-types.json) entra na lista do repo. Antes não
 *     entrava e por isso era acusado como órfão — medido em 2026-09-27 contra o
 *     volume de produção (ORPHAN=7, dos quais 2 eram versionados no main).
 *  2. O teste de órfão de _shared compara contra REPO_SHARED_ALL, não REPO_SHARED.
 *  3. RETIRED_FUNCTIONS cobre as funções retiradas com ADR (email-health,
 *     zapp-google-calendar-sync): continuam no volume como zumbis inertes
 *     (fora do registry, respondendo 404).
 *  4. Rigor preservado: uma função inventada NÃO está na lista de retiradas —
 *     ou seja, um órfão novo continua sendo reportado.
 *  5. Segurança: o input `prune` do edge-deploy.yml tem default false — nunca
 *     remove arquivo de produção sem dispatch explícito.
 *
 * NÃO cobre (por construção): execução contra o volume real (exige SSH na VPS).
 * Run: node --test infra/edge-deploy/__tests__/edge-orphan-registry.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT = join(HERE, '..', 'deploy-edge.sh');
const WORKFLOW = join(HERE, '..', '..', '..', '.github', 'workflows', 'edge-deploy.yml');

const sh = readFileSync(SCRIPT, 'utf8');
const wf = readFileSync(WORKFLOW, 'utf8');

/** Reproduz a pipeline `find` do script sobre uma árvore temporária de _shared. */
function listar(dir, { soTs }) {
  const args = ['-type', 'f'];
  if (soTs) args.push('-name', '*.ts');
  args.push(
    '!', '-path', '*/__tests__/*',
    '!', '-path', '*/__fixtures__/*',
    '!', '-name', '*.test.ts',
    '!', '-name', '*.spec.ts',
    '-printf', '%P\n',
  );
  return execFileSync('find', ['.', ...args], { cwd: dir, encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
}

test('1. a lista do repo inclui arquivos não-.ts versionados (comparação simétrica)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shared-'));
  mkdirSync(join(dir, '__tests__'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), '# doc\n');
  writeFileSync(join(dir, 'evolution-event-types.json'), '{}\n');
  writeFileSync(join(dir, 'mode.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, '__tests__', 'x.test.ts'), '// teste\n');

  const soTs = listar(dir, { soTs: true });
  const todos = listar(dir, { soTs: false });

  // é exatamente a assimetria que gerava os falsos positivos
  assert.equal(soTs.includes('README.md'), false, 'a lista antiga (só .ts) não via README.md');
  assert.equal(soTs.includes('evolution-event-types.json'), false, 'nem o .json');
  assert.deepEqual(
    todos,
    ['README.md', 'evolution-event-types.json', 'mode.ts'],
    'a lista nova vê todos os arquivos e continua excluindo __tests__',
  );
});

test('2. o teste de órfão de _shared usa a lista simétrica', () => {
  assert.match(sh, /REPO_SHARED_ALL/, 'deploy-edge.sh precisa declarar REPO_SHARED_ALL');
  assert.match(
    sh,
    /printf '%s\\n' "\$\{REPO_SHARED_ALL\[@\]\}" \| grep -qx "\$name"/,
    'a detecção de órfão precisa comparar contra REPO_SHARED_ALL (não REPO_SHARED)',
  );
});

test('3. funções retiradas com ADR estão no registry', () => {
  const m = sh.match(/RETIRED_FUNCTIONS=\(([^)]*)\)/);
  assert.ok(m, 'RETIRED_FUNCTIONS precisa existir no script');
  for (const fn of ['email-health', 'zapp-google-calendar-sync']) {
    assert.ok(m[1].includes(fn), `${fn} precisa estar em RETIRED_FUNCTIONS`);
  }
  // a justificativa (ADR) precisa existir no repo, não só o nome na lista
  const raiz = join(HERE, '..', '..', '..');
  const adrs = execFileSync('bash', ['-c', 'ls docs/_archive/ | grep -cE "email-health|calendar"'], {
    cwd: raiz, encoding: 'utf8',
  }).trim();
  assert.ok(Number(adrs) >= 1, 'a retirada precisa estar documentada em docs/_archive/');
});

test('4. rigor preservado: órfão desconhecido continua sendo reportado', () => {
  const retiradas = sh.match(/RETIRED_FUNCTIONS=\(([^)]*)\)/)[1].split(/\s+/).filter(Boolean);
  assert.equal(
    retiradas.includes('funcao-nova-desconhecida'), false,
    'a lista de retiradas não pode virar um curinga',
  );
  assert.match(
    sh,
    /RETIRED_FUNCTIONS\[@\]\}" \| grep -qx "\$name"; then\n\s+continue/,
    'a tolerância precisa ser um continue ANTES do incremento de ORPHAN',
  );
});

test('5. segurança: prune só por dispatch explícito (default false)', () => {
  assert.match(wf, /prune:/, 'edge-deploy.yml precisa expor o input prune');
  assert.match(wf, /default: false/, 'prune precisa ter default false');
  assert.match(wf, /--apply --restart/, 'o deploy normal continua sem prune');
});
