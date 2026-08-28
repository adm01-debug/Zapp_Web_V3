import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isAbsolute, relative, win32 } from 'node:path';

const requireFromThisRepository = createRequire(import.meta.url);
const ANSI_ESCAPE_RE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const SOURCE_DIAGNOSTIC_RE = /^(.*\.(?:[cm]?tsx?))\((\d+),(\d+)\): error TS(\d+):\s*(.*)$/;
const ANY_ERROR_DIAGNOSTIC_RE = /error TS\d+:/;
const FATAL_PROCESS_OUTPUT_RE =
  /^(?:FATAL(?: ERROR)?|INTERNAL COMPILER ERROR|JavaScript heap out of memory|heap out of memory|segmentation fault|uncaught(?: exception)?|node:internal(?:[\\/]|:)|npm (?:ERR!|error)|pnpm (?:ERR_|error)|bun (?:error|panic)|panic:|ERR_[A-Z0-9_]+)/im;

export const DEFAULT_TSC_TIMEOUT_MS = 5 * 60 * 1_000;
export const DEFAULT_TSC_MAX_BUFFER = 64 * 1024 * 1024;

const TYPECHECK_EXIT_STATUSES = new Set([1, 2]);

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
  let repositoryRelative = normalized;

  if (win32.isAbsolute(file) && win32.isAbsolute(cwd)) {
    repositoryRelative = win32.relative(cwd, file);
  } else if (isAbsolute(normalized)) {
    repositoryRelative = relative(cwd, normalized);
  }

  return repositoryRelative.replace(/\\/g, '/').replace(/^\.\//, '');
}

function combineProcessOutput(stdout, stderr) {
  if (!stdout) return stderr;
  if (!stderr) return stdout;
  return stdout.endsWith('\n') ? `${stdout}${stderr}` : `${stdout}\n${stderr}`;
}

function forcePlainDiagnostics(args) {
  const normalizedArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = String(args[index]);
    if (argument === '--pretty') {
      if (/^(?:true|false)$/i.test(String(args[index + 1] ?? ''))) index += 1;
      continue;
    }
    if (/^--pretty=/i.test(argument)) continue;
    normalizedArgs.push(argument);
  }

  return [...normalizedArgs, '--pretty', 'false'];
}

function validateExecutionLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeScriptInvocationError(`${label} deve ser um inteiro positivo.`, {
      kind: 'configuration',
    });
  }
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
  maxBuffer = DEFAULT_TSC_MAX_BUFFER,
  nodePath = process.execPath,
  resolveTscImpl = resolveLocalTsc,
  spawnSyncImpl = spawnSync,
  timeoutMs = DEFAULT_TSC_TIMEOUT_MS,
} = {}) {
  validateExecutionLimit(timeoutMs, 'timeoutMs');
  validateExecutionLimit(maxBuffer, 'maxBuffer');

  const compilerArgs = forcePlainDiagnostics(args);
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
    result = spawnSyncImpl(nodePath, [tscPath, ...compilerArgs], {
      cwd,
      env,
      encoding: 'utf8',
      killSignal: 'SIGTERM',
      maxBuffer,
      shell: false,
      timeout: timeoutMs,
    });
  } catch (cause) {
    throw new TypeScriptInvocationError('Não foi possível iniciar o compilador TypeScript local.', {
      cause,
    });
  }

  const output = combineProcessOutput(result?.stdout ?? '', result?.stderr ?? '');
  const cleanOutput = output.replace(ANSI_ESCAPE_RE, '');
  const cleanOutputLines = cleanOutput.split(/\r?\n/);
  const diagnostics = parseTypeScriptDiagnostics(output, { cwd });
  const unscopedDiagnostics = cleanOutputLines.filter(
    (line) => ANY_ERROR_DIAGNOSTIC_RE.test(line) && !SOURCE_DIAGNOSTIC_RE.test(line)
  );

  if (result?.error) {
    const timedOut = result.error.code === 'ETIMEDOUT';
    const outputExceeded = result.error.code === 'ENOBUFS';
    throw new TypeScriptInvocationError(
      timedOut
        ? `Compilador TypeScript excedeu o timeout de ${timeoutMs} ms; saída parcial recusada.`
        : outputExceeded
          ? `Saída do compilador TypeScript excedeu ${maxBuffer} bytes; saída parcial recusada.`
          : 'Falha ao iniciar o processo do compilador TypeScript local.',
      {
        cause: result.error,
        output,
        kind: timedOut ? 'timeout' : outputExceeded ? 'output-limit' : 'invocation',
      }
    );
  }

  if (result?.signal || !Number.isInteger(result?.status)) {
    throw new TypeScriptInvocationError(
      `Compilador TypeScript terminou de forma anormal${result?.signal ? ` (sinal ${result.signal})` : ''}.`,
      { output }
    );
  }

  if (result.status !== 0 && !TYPECHECK_EXIT_STATUSES.has(result.status)) {
    throw new TypeScriptInvocationError(
      `Compilador TypeScript retornou exit code não suportado (${result.status}); resultado recusado.\n${outputExcerpt(output)}`,
      { output }
    );
  }

  if (FATAL_PROCESS_OUTPUT_RE.test(cleanOutput)) {
    throw new TypeScriptInvocationError(
      `Compilador TypeScript emitiu uma falha fatal; saída parcial recusada.\n${outputExcerpt(output)}`,
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
    args: compilerArgs,
    status: result.status,
    output,
    diagnostics,
    hasTypeScriptErrors: diagnostics.length > 0,
  };
}
