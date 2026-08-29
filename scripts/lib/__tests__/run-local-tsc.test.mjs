import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_TSC_MAX_BUFFER,
  DEFAULT_TSC_TIMEOUT_MS,
  parseTypeScriptDiagnostics,
  runLocalTsc,
  TypeScriptInvocationError,
} from '../run-local-tsc.mjs';
import { evaluateRatchet, executeRatchet, isMainModule } from '../../check-tsc-ratchet.mjs';

const fakeTscPath = '/repo/node_modules/typescript/bin/tsc';
const resolveFakeTsc = () => fakeTscPath;

test('falha de resolução local é infraestrutura, sem fallback para rede', () => {
  assert.throws(
    () =>
      runLocalTsc({
        resolveTscImpl: () => {
          throw Object.assign(new Error('Cannot find module typescript/bin/tsc'), {
            code: 'MODULE_NOT_FOUND',
          });
        },
      }),
    (error) =>
      error instanceof TypeScriptInvocationError &&
      error.kind === 'resolution' &&
      /resolver o compilador TypeScript local/i.test(error.message)
  );
});

test('erro 404 de bunx/npx simulado não vira zero diagnósticos', () => {
  assert.throws(
    () =>
      runLocalTsc({
        resolveTscImpl: resolveFakeTsc,
        spawnSyncImpl: () => ({
          status: 1,
          stdout: '',
          stderr: 'npm error 404 Not Found - GET https://registry.npmjs.org/tsgo',
        }),
      }),
    (error) =>
      error instanceof TypeScriptInvocationError &&
      /falha fatal|resultado de código confiável/i.test(error.message) &&
      /404 Not Found/.test(error.output)
  );
});

test('diagnóstico global de configuração não é confundido com erro de fonte', () => {
  assert.throws(
    () =>
      runLocalTsc({
        resolveTscImpl: resolveFakeTsc,
        spawnSyncImpl: () => ({
          status: 1,
          stdout: "error TS5058: The specified path does not exist: 'missing.json'.\n",
          stderr: '',
        }),
      }),
    (error) =>
      error instanceof TypeScriptInvocationError &&
      /resultado de código confiável/i.test(error.message)
  );
});

test('erro ao iniciar o processo é falha de invocação', () => {
  const launchError = Object.assign(new Error('spawn ENOENT'), {
    code: 'ENOENT',
  });
  assert.throws(
    () =>
      runLocalTsc({
        resolveTscImpl: resolveFakeTsc,
        spawnSyncImpl: () => ({
          status: null,
          stdout: '',
          stderr: '',
          error: launchError,
        }),
      }),
    (error) =>
      error instanceof TypeScriptInvocationError &&
      error.cause === launchError &&
      /iniciar o processo/i.test(error.message)
  );
});

test('execução limpa preserva zero diagnósticos e usa process.execPath', () => {
  let invocation;
  const result = runLocalTsc({
    resolveTscImpl: resolveFakeTsc,
    spawnSyncImpl: (command, args, options) => {
      invocation = { command, args, options };
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [
    fakeTscPath,
    '--noEmit',
    '-p',
    'tsconfig.app.json',
    '--pretty',
    'false',
  ]);
  assert.equal(invocation.options.killSignal, 'SIGTERM');
  assert.equal(invocation.options.maxBuffer, DEFAULT_TSC_MAX_BUFFER);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.timeout, DEFAULT_TSC_TIMEOUT_MS);
  assert.equal(result.status, 0);
  assert.deepEqual(result.diagnostics, []);
});

test('invocação força --pretty false mesmo quando o chamador pede cores', () => {
  let invocation;
  runLocalTsc({
    args: ['--noEmit', '--pretty', 'true', '-p', 'tsconfig.app.json'],
    resolveTscImpl: resolveFakeTsc,
    spawnSyncImpl: (command, args) => {
      invocation = { command, args };
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  assert.deepEqual(invocation.args, [
    fakeTscPath,
    '--noEmit',
    '-p',
    'tsconfig.app.json',
    '--pretty',
    'false',
  ]);
});

test('erros TS reais retornam diagnósticos de arquivo, não falha de infraestrutura', () => {
  const result = runLocalTsc({
    resolveTscImpl: resolveFakeTsc,
    spawnSyncImpl: () => ({
      status: 2,
      stdout: 'src/example.ts(7,11): error TS2322: Type string is not assignable to number.\n',
      stderr: '',
    }),
  });

  assert.equal(result.hasTypeScriptErrors, true);
  assert.deepEqual(result.diagnostics, [
    {
      file: 'src/example.ts',
      line: 7,
      column: 11,
      code: 'TS2322',
      message: 'Type string is not assignable to number.',
      rawLine: 'src/example.ts(7,11): error TS2322: Type string is not assignable to number.',
    },
  ]);
});

test('parser remove ANSI, aceita CRLF e torna caminho POSIX absoluto relativo ao repositório', () => {
  const diagnostics = parseTypeScriptDiagnostics(
    '\u001B[31m/repo/src/example.ts(3,5): error TS2322: inválido\u001B[0m\r\n',
    { cwd: '/repo' }
  );

  assert.deepEqual(diagnostics, [
    {
      file: 'src/example.ts',
      line: 3,
      column: 5,
      code: 'TS2322',
      message: 'inválido',
      rawLine: '/repo/src/example.ts(3,5): error TS2322: inválido',
    },
  ]);
});

test('parser normaliza caminho Windows absoluto sem depender do SO do runner', () => {
  const diagnostics = parseTypeScriptDiagnostics(
    'C:\\repo\\src\\example.ts(4,6): error TS2345: argumento inválido\r\n',
    { cwd: 'C:\\repo' }
  );

  assert.equal(diagnostics[0].file, 'src/example.ts');
});

test('stdout sem quebra final não funde o primeiro diagnóstico de stderr', () => {
  const result = runLocalTsc({
    cwd: '/repo',
    resolveTscImpl: resolveFakeTsc,
    spawnSyncImpl: () => ({
      status: 2,
      stdout: 'src/one.ts(1,1): error TS2322: one',
      stderr: 'src/two.ts(2,2): error TS2322: two\r\n',
    }),
  });

  assert.deepEqual(
    result.diagnostics.map(({ file }) => file),
    ['src/one.ts', 'src/two.ts']
  );
  assert.match(result.output, /one\ntwo\.ts|one\nsrc\/two\.ts/);
});

test('saída pretty inesperada é recusada em vez de parecer zero erros', () => {
  assert.throws(
    () =>
      runLocalTsc({
        resolveTscImpl: resolveFakeTsc,
        spawnSyncImpl: () => ({
          status: 2,
          stdout: 'src/example.ts:1:2 - error TS2322: inválido\n',
          stderr: '',
        }),
      }),
    (error) =>
      error instanceof TypeScriptInvocationError &&
      /resultado de código confiável/i.test(error.message)
  );
});

for (const status of [3, 4]) {
  test(`exit ${status} é infraestrutura mesmo contendo diagnóstico de fonte`, () => {
    assert.throws(
      () =>
        runLocalTsc({
          resolveTscImpl: resolveFakeTsc,
          spawnSyncImpl: () => ({
            status,
            stdout: 'src/example.ts(1,1): error TS2322: inválido\n',
            stderr: '',
          }),
        }),
      (error) =>
        error instanceof TypeScriptInvocationError &&
        new RegExp(`exit code não suportado \\(${status}\\)`, 'i').test(error.message)
    );
  });
}

test('diagnóstico parcial seguido de falha fatal é infraestrutura', () => {
  assert.throws(
    () =>
      runLocalTsc({
        resolveTscImpl: resolveFakeTsc,
        spawnSyncImpl: () => ({
          status: 2,
          stdout: 'src/example.ts(1,1): error TS2322: inválido',
          stderr: 'FATAL ERROR: Reached heap limit\n',
        }),
      }),
    (error) =>
      error instanceof TypeScriptInvocationError &&
      /falha fatal/i.test(error.message) &&
      /src\/example\.ts/.test(error.output)
  );
});

test('timeout explícito recusa saída parcial e preserva a causa', () => {
  const timeoutError = Object.assign(new Error('spawnSync ETIMEDOUT'), {
    code: 'ETIMEDOUT',
  });

  assert.throws(
    () =>
      runLocalTsc({
        resolveTscImpl: resolveFakeTsc,
        timeoutMs: 180_000,
        spawnSyncImpl: (command, args, options) => {
          assert.equal(options.timeout, 180_000);
          return {
            status: null,
            signal: 'SIGTERM',
            stdout: 'src/partial.ts(1,1): error TS2322: parcial\n',
            stderr: '',
            error: timeoutError,
          };
        },
      }),
    (error) =>
      error instanceof TypeScriptInvocationError &&
      error.kind === 'timeout' &&
      error.cause === timeoutError &&
      /saída parcial recusada/i.test(error.message)
  );
});

test('estouro de maxBuffer recusa saída truncada', () => {
  const bufferError = Object.assign(new Error('spawnSync ENOBUFS'), {
    code: 'ENOBUFS',
  });

  assert.throws(
    () =>
      runLocalTsc({
        maxBuffer: 1_024,
        resolveTscImpl: resolveFakeTsc,
        spawnSyncImpl: (command, args, options) => {
          assert.equal(options.maxBuffer, 1_024);
          return {
            status: null,
            stdout: 'src/partial.ts(1,1): error TS2322: parcial\n',
            stderr: '',
            error: bufferError,
          };
        },
      }),
    (error) =>
      error instanceof TypeScriptInvocationError &&
      error.kind === 'output-limit' &&
      error.cause === bufferError &&
      /saída parcial recusada/i.test(error.message)
  );
});

test('ratchet reprova novo erro quando baseline está em zero', () => {
  const result = evaluateRatchet(
    { total: 1, files: { 'src/example.ts': 1 } },
    { total: 0, files: {} }
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.regressions, [{ file: 'src/example.ts', previous: 0, count: 1 }]);
});

test('--update recusa falha de infraestrutura e não altera baseline', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'tsc-ratchet-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const baselinePath = join(directory, 'baseline.json');
  const original = '{"total":0,"files":{}}\n';
  writeFileSync(baselinePath, original);

  assert.throws(
    () =>
      executeRatchet({
        update: true,
        baselinePath,
        runTscImpl: () => {
          throw new TypeScriptInvocationError('registry 404', {
            output: '404 Not Found',
          });
        },
      }),
    TypeScriptInvocationError
  );
  assert.equal(readFileSync(baselinePath, 'utf8'), original);
});

test('--update também recusa aumentar um baseline válido', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'tsc-ratchet-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const baselinePath = join(directory, 'baseline.json');
  const original = '{"total":0,"files":{}}\n';
  writeFileSync(baselinePath, original);

  assert.throws(
    () =>
      executeRatchet({
        update: true,
        baselinePath,
        runTscImpl: () => ({
          diagnostics: [
            {
              file: 'src/regression.ts',
              line: 1,
              column: 1,
              code: 'TS2322',
              message: 'regression',
              rawLine: 'src/regression.ts(1,1): error TS2322: regression',
            },
          ],
        }),
      }),
    /--update recusado/
  );
  assert.equal(readFileSync(baselinePath, 'utf8'), original);
});

test('--update recusa baseline ausente antes de executar o compilador', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'tsc-ratchet-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const baselinePath = join(directory, 'baseline.json');
  let compilerInvoked = false;

  assert.throws(
    () =>
      executeRatchet({
        update: true,
        baselinePath,
        runTscImpl: () => {
          compilerInvoked = true;
          return { diagnostics: [] };
        },
      }),
    /--update recusado: baseline ausente/i
  );
  assert.equal(compilerInvoked, false);
  assert.equal(existsSync(baselinePath), false);
});

test('entrypoint reconhece invocação por symlink via realpath', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'tsc-entrypoint-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const targetPath = join(directory, 'target.mjs');
  const symlinkPath = join(directory, 'entrypoint.mjs');
  writeFileSync(targetPath, '');

  try {
    symlinkSync(targetPath, symlinkPath, 'file');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      context.skip(`symlink indisponível neste runner: ${error.code}`);
      return;
    }
    throw error;
  }

  assert.equal(isMainModule(symlinkPath, targetPath), true);
});
