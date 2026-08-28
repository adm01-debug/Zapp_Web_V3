import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isAbsolute, relative } from 'node:path';

const requireFromThisRepository = createRequire(import.meta.url);
const ANSI_ESCAPE_RE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const SOURCE_DIAGNOSTIC_RE = /^(.*\.(?:[cm]?tsx?))\((\d+),(\d+)\): error TS(\d+):\s*(.*)$/;
const ANY_ERROR_DIAGNOSTIC_RE = /error TS\d+:/;

export class TypeScriptInvocationError extends Error {
  constructor(message, { cause, output = '', kind = 'invocation' } = {}) {
    super(message, { cause });
    this.name = 'TypeScriptInvocationError';
    this.code = 'TSC_INVOCATION_FAILED';
    this.kind = kind;
    this.output = output;
  }
}

function normalizeFile(file, cwd) {
  const normalized = file.replace(/\\/g, '/');
  const repositoryRelative = isAbsolute(normalized) ? relative(cwd, normalized) : normalized;
  return repositoryRelative.replace(/\\/g, '/').replace(/^\.\//, '');
}

function outputExcerpt(output) {
  const trimmed = output.trim();
  if (!trimmed) return '(sem saída do processo)';
  return trimmed.length > 2_000 ? `${trimmed.slice(0, 2_000)}\n…` : trimmed;
}

export function parseTypeScriptDiagnostics(output, { cwd = process.cwd() } = {}) {
  const diagnostics = [];

  for (const rawLine of output.replace(ANSI_ESCAPE_RE, '').split(/\r?\n/)) {
    const match = SOURCE_DIAGNOSTIC_RE.exec(rawLine);
    if (!match) continue;

    diagnostics.push({
      file: normalizeFile(match[1], cwd),
      line: Number(match[2]),
      column: Number(match[3]),
      code: `TS${match[4]}`,
      message: match[5],
      rawLine,
    });
  }

  return diagnostics;
}

export function resolveLocalTsc({ requireFn = requireFromThisRepository } = {}) {
  try {
    return requireFn.resolve('typescript/bin/tsc');
  } catch (cause) {
    throw new TypeScriptInvocationError(
      'TypeScript local não encontrado. Instale as dependências bloqueadas pelo lockfile antes de executar o gate.',
      { cause, kind: 'resolution' }
    );
  }
}

/**
 * Executa somente o compilador TypeScript instalado no repositório.
 *
 * Um exit code não zero com diagnósticos de arquivo é uma falha de tipos válida
 * e volta ao chamador para filtragem/ratchet. Qualquer outra falha não zero é
 * tratada como infraestrutura quebrada e interrompe o gate (fail-closed).
 */
export function runLocalTsc({
  args = ['--noEmit', '-p', 'tsconfig.app.json'],
  cwd = process.cwd(),
  env = process.env,
  nodePath = process.execPath,
  resolveTscImpl = resolveLocalTsc,
  spawnSyncImpl = spawnSync,
} = {}) {
  let tscPath;
  try {
    tscPath = resolveTscImpl();
  } catch (cause) {
    if (cause instanceof TypeScriptInvocationError) throw cause;
    throw new TypeScriptInvocationError('Falha ao resolver o compilador TypeScript local.', {
      cause,
      kind: 'resolution',
    });
  }

  let result;
  try {
    result = spawnSyncImpl(nodePath, [tscPath, ...args], {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
    });
  } catch (cause) {
    throw new TypeScriptInvocationError('Não foi possível iniciar o compilador TypeScript local.', {
      cause,
    });
  }

  const output = `${result?.stdout ?? ''}${result?.stderr ?? ''}`;
  const cleanOutputLines = output.replace(ANSI_ESCAPE_RE, '').split(/\r?\n/);
  const diagnostics = parseTypeScriptDiagnostics(output, { cwd });
  const unscopedDiagnostics = cleanOutputLines.filter(
    (line) => ANY_ERROR_DIAGNOSTIC_RE.test(line) && !SOURCE_DIAGNOSTIC_RE.test(line)
  );

  if (result?.error) {
    throw new TypeScriptInvocationError(
      'Falha ao iniciar o processo do compilador TypeScript local.',
      {
        cause: result.error,
        output,
      }
    );
  }

  if (result?.signal || !Number.isInteger(result?.status)) {
    throw new TypeScriptInvocationError(
      `Compilador TypeScript terminou de forma anormal${result?.signal ? ` (sinal ${result.signal})` : ''}.`,
      { output }
    );
  }

  if (result.status !== 0 && (diagnostics.length === 0 || unscopedDiagnostics.length > 0)) {
    throw new TypeScriptInvocationError(
      `Compilador TypeScript falhou sem um resultado de código confiável (exit ${result.status}).\n${outputExcerpt(output)}`,
      { output }
    );
  }

  if (result.status === 0 && (diagnostics.length > 0 || unscopedDiagnostics.length > 0)) {
    throw new TypeScriptInvocationError(
      'Compilador TypeScript retornou sucesso junto com diagnósticos de erro; resultado inconsistente.',
      { output }
    );
  }

  return {
    command: nodePath,
    tscPath,
    args: [...args],
    status: result.status,
    output,
    diagnostics,
    hasTypeScriptErrors: diagnostics.length > 0,
  };
}
