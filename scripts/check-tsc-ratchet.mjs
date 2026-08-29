#!/usr/bin/env node
/**
 * TypeScript error ratchet.
 *
 * Executa o `typescript/bin/tsc` instalado localmente e compara diagnósticos de
 * código com `scripts/tsc-error-baseline.json`. Falhas de resolução/execução do
 * compilador nunca são interpretadas como uma suíte limpa.
 *
 * Para congelar uma redução real de dívida:
 *   node scripts/check-tsc-ratchet.mjs --update
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runLocalTsc, TypeScriptInvocationError } from './lib/run-local-tsc.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const BASELINE_PATH = join(dirname(SCRIPT_PATH), 'tsc-error-baseline.json');

export function summarizeDiagnostics(diagnostics) {
  const files = new Map();
  for (const diagnostic of diagnostics) {
    files.set(diagnostic.file, (files.get(diagnostic.file) ?? 0) + 1);
  }

  return {
    total: diagnostics.length,
    files: Object.fromEntries([...files.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function validateErrorSummary(summary, label = 'baseline') {
  if (!summary || !Number.isSafeInteger(summary.total) || summary.total < 0) {
    throw new Error(`${label} inválido: total deve ser um inteiro não negativo.`);
  }
  if (!summary.files || typeof summary.files !== 'object' || Array.isArray(summary.files)) {
    throw new Error(`${label} inválido: files deve ser um objeto.`);
  }

  let fileTotal = 0;
  for (const [file, count] of Object.entries(summary.files)) {
    if (!file || !Number.isSafeInteger(count) || count < 1) {
      throw new Error(`${label} inválido: contagem inválida para '${file || '(arquivo vazio)'}'.`);
    }
    fileTotal += count;
  }
  if (fileTotal !== summary.total) {
    throw new Error(`${label} inválido: total=${summary.total}, soma por arquivo=${fileTotal}.`);
  }

  return summary;
}

export function evaluateRatchet(current, baseline) {
  validateErrorSummary(current, 'resultado atual');
  validateErrorSummary(baseline, 'baseline');

  const regressions = [];
  for (const [file, count] of Object.entries(current.files)) {
    const previous = baseline.files[file] ?? 0;
    if (count > previous) regressions.push({ file, previous, count });
  }

  return {
    passed: current.total <= baseline.total && regressions.length === 0,
    regressions,
    removed: Math.max(0, baseline.total - current.total),
  };
}

export function executeRatchet({
  update = false,
  baselinePath = BASELINE_PATH,
  runTscImpl = runLocalTsc,
} = {}) {
  if (update && !existsSync(baselinePath)) {
    throw new Error(
      `--update recusado: baseline ausente em ${baselinePath}. Restaure o baseline versionado antes de atualizá-lo.`
    );
  }

  // runLocalTsc lança antes de qualquer leitura/escrita se o compilador não puder
  // ser executado. Isso impede que --update grave um falso baseline zero.
  const compilerResult = runTscImpl();
  const current = validateErrorSummary(
    summarizeDiagnostics(compilerResult.diagnostics),
    'resultado atual'
  );

  if (update) {
    let existingBaseline;
    try {
      existingBaseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    } catch (cause) {
      throw new Error(`baseline inválido em ${baselinePath}: ${cause.message}`, { cause });
    }
    validateErrorSummary(existingBaseline, 'baseline');
    const updateEvaluation = evaluateRatchet(current, existingBaseline);
    if (!updateEvaluation.passed) {
      throw new Error(
        '--update recusado: o resultado atual aumenta ou desloca a dívida TypeScript do baseline.'
      );
    }
    writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    return { mode: 'updated', current };
  }

  if (!existsSync(baselinePath)) {
    throw new Error(`baseline ausente em ${baselinePath}. Gere com --update.`);
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch (cause) {
    throw new Error(`baseline inválido em ${baselinePath}: ${cause.message}`, {
      cause,
    });
  }
  validateErrorSummary(baseline, 'baseline');

  return {
    mode: 'checked',
    current,
    baseline,
    ...evaluateRatchet(current, baseline),
  };
}

function printResult(result) {
  if (result.mode === 'updated') {
    console.log(
      `baseline atualizado: ${result.current.total} erros em ${Object.keys(result.current.files).length} arquivos.`
    );
    return 0;
  }

  if (!result.passed) {
    console.error('❌ TypeScript ratchet: regressão detectada.');
    console.error(`   total: baseline=${result.baseline.total} atual=${result.current.total}`);
    for (const regression of result.regressions) {
      console.error(`   ${regression.file}: ${regression.previous} → ${regression.count}`);
    }
    console.error('\nCorrija os erros ou, após remover erros, avance o baseline:');
    console.error('  node scripts/check-tsc-ratchet.mjs --update');
    return 1;
  }

  if (result.removed > 0) {
    console.log(
      `✅ TypeScript ratchet: ${result.removed} erros removidos ` +
        `(${result.baseline.total} → ${result.current.total}). Rode --update para congelar o progresso.`
    );
  } else {
    console.log(`✅ TypeScript ratchet: ${result.current.total} erros (baseline preservado).`);
  }
  return 0;
}

function canonicalEntrypoint(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function isMainModule(candidate = process.argv[1], scriptPath = SCRIPT_PATH) {
  return Boolean(candidate) && canonicalEntrypoint(candidate) === canonicalEntrypoint(scriptPath);
}

if (isMainModule()) {
  try {
    process.exitCode = printResult(executeRatchet({ update: process.argv.includes('--update') }));
  } catch (error) {
    const infrastructure = error instanceof TypeScriptInvocationError;
    console.error(
      infrastructure
        ? '❌ TypeScript ratchet: falha de infraestrutura; resultado recusado (fail-closed).'
        : '❌ TypeScript ratchet: configuração inválida.'
    );
    console.error(`   ${error.message}`);
    process.exitCode = 2;
  }
}
