import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runLocalTsc, TypeScriptInvocationError } from '../run-local-tsc.mjs';
import { evaluateRatchet, executeRatchet } from '../../check-tsc-ratchet.mjs';

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
      /resultado de código confiável/i.test(error.message) &&
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
  const launchError = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
  assert.throws(
    () =>
      runLocalTsc({
        resolveTscImpl: resolveFakeTsc,
        spawnSyncImpl: () => ({ status: null, stdout: '', stderr: '', error: launchError }),
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
  assert.deepEqual(invocation.args, [fakeTscPath, '--noEmit', '-p', 'tsconfig.app.json']);
  assert.equal(invocation.options.shell, false);
  assert.equal(result.status, 0);
  assert.deepEqual(result.diagnostics, []);
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

test('ratchet reprova novo erro quando baseline está em zero', () => {
  const result = evaluateRatchet(
    { total: 1, files: { 'src/example.ts': 1 } },
    { total: 0, files: {} }
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.regressions, [{ file: 'src/example.ts', previous: 0, count: 1 }]);
});

test('--update recusa falha de infraestrutura e não altera baseline', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tsc-ratchet-'));
  const baselinePath = join(directory, 'baseline.json');
  const original = '{"total":0,"files":{}}\n';
  writeFileSync(baselinePath, original);

  assert.throws(
    () =>
      executeRatchet({
        update: true,
        baselinePath,
        runTscImpl: () => {
          throw new TypeScriptInvocationError('registry 404', { output: '404 Not Found' });
        },
      }),
    TypeScriptInvocationError
  );
  assert.equal(readFileSync(baselinePath, 'utf8'), original);
});

test('--update também recusa aumentar um baseline válido', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tsc-ratchet-'));
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
