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
 *
 * POR QUE NÃO `node --test`: o job que hospeda este teste roda em runner
 * self-hosted cujo Node é anterior ao 18 — `node --test` falha com
 * "node: bad option: --test" (medido no run 36328997858, 2026-09-27). Este
 * arquivo é um script autônomo: qualquer Node com ESM roda, e a saída usa TAP
 * (ok/not ok) para ficar legível no log do CI.
 *
 * Run: node infra/edge-deploy/__tests__/edge-orphan-registry.test.mjs
 */
import assert from 'assert';
import { execFileSync } from 'child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(HERE, '..', '..', '..');
const SCRIPT = join(HERE, '..', 'deploy-edge.sh');
const WORKFLOW = join(RAIZ, '.github', 'workflows', 'edge-deploy.yml');

const sh = readFileSync(SCRIPT, 'utf8');
const wf = readFileSync(WORKFLOW, 'utf8');

/** Reproduz a pipeline `find` do script sobre uma árvore temporária de _shared. */
function listar(dir, soTs) {
  const args = ['-type', 'f'];
  if (soTs) args.push('-name', '*.ts');
  args.push(
    '!', '-path', '*/__tests__/*',
    '!', '-path', '*/__fixtures__/*',
    '!', '-name', '*.test.ts',
    '!', '-name', '*.spec.ts',
    '-printf', '%P\n',
  );
  return execFileSync('find', ['.'].concat(args), { cwd: dir, encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
}

let falhas = 0;
function teste(nome, fn) {
  try {
    fn();
    console.log('ok - ' + nome);
  } catch (e) {
    falhas++;
    console.log('not ok - ' + nome + '\n  ' + (e && e.message ? e.message : String(e)));
  }
}

teste('1. a lista do repo inclui arquivos não-.ts versionados (comparação simétrica)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shared-'));
  mkdirSync(join(dir, '__tests__'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), '# doc\n');
  writeFileSync(join(dir, 'evolution-event-types.json'), '{}\n');
  writeFileSync(join(dir, 'mode.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, '__tests__', 'x.test.ts'), '// teste\n');

  const soTs = listar(dir, true);
  const todos = listar(dir, false);

  // é exatamente a assimetria que gerava os falsos positivos
  assert.deepStrictEqual(soTs.indexOf('README.md'), -1,
    'a lista antiga (só .ts) não deveria ver README.md');
  assert.deepStrictEqual(soTs.indexOf('evolution-event-types.json'), -1,
    'a lista antiga (só .ts) não deveria ver o .json');
  assert.deepStrictEqual(todos, ['README.md', 'evolution-event-types.json', 'mode.ts'],
    'a lista nova vê todos os arquivos e continua excluindo __tests__');
});

teste('2. o teste de órfão de _shared usa a lista simétrica', () => {
  assert.ok(sh.indexOf('REPO_SHARED_ALL') !== -1,
    'deploy-edge.sh precisa declarar REPO_SHARED_ALL');
  assert.ok(
    sh.indexOf('printf \'%s\\n\' "${REPO_SHARED_ALL[@]}" | grep -qx "$name"') !== -1,
    'a detecção de órfão precisa comparar contra REPO_SHARED_ALL (não REPO_SHARED)',
  );
});

teste('3. funções retiradas com ADR estão no registry', () => {
  const m = sh.match(/RETIRED_FUNCTIONS=\(([^)]*)\)/);
  assert.ok(m, 'RETIRED_FUNCTIONS precisa existir no script');
  ['email-health', 'zapp-google-calendar-sync'].forEach((fn) => {
    assert.ok(m[1].indexOf(fn) !== -1, fn + ' precisa estar em RETIRED_FUNCTIONS');
  });
  // a justificativa (ADR) precisa existir no repo, não só o nome na lista
  const adrs = execFileSync('bash', ['-c', 'ls docs/_archive/ | grep -cE "email-health|calendar"'],
    { cwd: RAIZ, encoding: 'utf8' }).trim();
  assert.ok(Number(adrs) >= 1, 'a retirada precisa estar documentada em docs/_archive/');
});

teste('4. rigor preservado: órfão desconhecido continua sendo reportado', () => {
  const retiradas = sh.match(/RETIRED_FUNCTIONS=\(([^)]*)\)/)[1].split(/\s+/).filter(Boolean);
  assert.strictEqual(retiradas.indexOf('funcao-nova-desconhecida'), -1,
    'a lista de retiradas não pode virar um curinga');
  const alvo = 'RETIRED_FUNCTIONS[@]}" | grep -qx "$name"; then';
  const pos = sh.indexOf(alvo);
  assert.ok(pos !== -1, 'a tolerância precisa testar RETIRED_FUNCTIONS');
  assert.ok(/^\s*continue/m.test(sh.slice(pos, pos + 120)),
    'a tolerância precisa ser um continue ANTES do incremento de ORPHAN');
});

teste('5. segurança: prune só por dispatch explícito (default false)', () => {
  assert.ok(wf.indexOf('prune:') !== -1, 'edge-deploy.yml precisa expor o input prune');
  assert.ok(wf.indexOf('default: false') !== -1, 'prune precisa ter default false');
  assert.ok(wf.indexOf('--apply --restart') !== -1, 'o deploy normal continua sem prune');
});

console.log((falhas === 0 ? 'ok' : 'not ok') + ' - 5 testes do registry de órfãos (falhas=' + falhas + ')');
process.exit(falhas === 0 ? 0 : 1);
