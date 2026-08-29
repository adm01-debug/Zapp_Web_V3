#!/usr/bin/env node
/**
 * Ratchet TypeScript por cluster.
 *
 * Executa uma única vez o compilador TypeScript instalado localmente e atribui
 * seus diagnósticos aos arquivos de cada cluster. Falha de invocação encerra o
 * gate sem transformar indisponibilidade do compilador em falso sucesso.
 */
import { existsSync, readFileSync } from 'node:fs';
import { globSync } from 'glob';

import { runLocalTsc, TypeScriptInvocationError } from './lib/run-local-tsc.mjs';

const NOCHECK_BASELINE_PATH = 'scripts/ts-nocheck-baseline.txt';
const nocheckBaseline = new Set(
  existsSync(NOCHECK_BASELINE_PATH)
    ? readFileSync(NOCHECK_BASELINE_PATH, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : []
);

const CLUSTERS = {
  'crm-sales': [
    'src/features/inbox/components/CRMAutoSync.tsx',
    'src/hooks/useCRMManagement.ts',
    'src/hooks/useSyncToCRM.ts',
    'src/features/sales/**/*.{ts,tsx}',
  ],
  'inbox-core': [
    'src/features/inbox/hooks/**/*.{ts,tsx}',
    'src/features/inbox/components/ChatPanel.tsx',
    'src/features/inbox/components/ChatHeader.tsx',
    'src/features/inbox/components/ChatInputArea.tsx',
  ],
  'chat-components': ['src/features/inbox/components/chat/**/*.{ts,tsx}', 'src/lib/reactRefs.ts'],
  queues: [
    'src/hooks/useQueueManagement.ts',
    'src/hooks/useQueueAnalytics.ts',
    'src/hooks/useQueueSlaPanel.ts',
  ],
  observability: ['src/hooks/useAlertManagement.ts', 'src/hooks/usePerformanceMonitoring.ts'],
};

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function expand(patterns) {
  const files = new Set();
  for (const pattern of patterns) {
    if (pattern.includes('*') || pattern.includes('?') || pattern.includes('{')) {
      for (const file of globSync(pattern, { nodir: true })) files.add(normalizePath(file));
    } else if (existsSync(pattern)) {
      files.add(normalizePath(pattern));
    }
  }
  return [...files].sort();
}

const cli = process.argv.slice(2);
const filterIndex = cli.indexOf('--cluster');
const targetCluster = filterIndex >= 0 ? cli[filterIndex + 1] : null;
const selected = Object.entries(CLUSTERS).filter(
  ([name]) => !targetCluster || targetCluster === name
);

if (selected.length === 0 || (filterIndex >= 0 && !targetCluster)) {
  console.error(`✗ Nenhum cluster casou com filtro '${targetCluster ?? ''}'`);
  process.exit(2);
}

const clusterFiles = selected.map(([name, patterns]) => ({ name, files: expand(patterns) }));
const nonEmptyClusters = clusterFiles.filter(({ files }) => files.length > 0);
if (nonEmptyClusters.length === 0) {
  console.error(`✗ Nenhum arquivo casou com filtro '${targetCluster ?? 'todos'}'`);
  process.exit(2);
}

let compilerResult;
try {
  compilerResult = runLocalTsc();
} catch (error) {
  console.error('✗ TypeScript por cluster: falha de infraestrutura (fail-closed).');
  console.error(
    `    ${error instanceof TypeScriptInvocationError ? error.message : String(error)}`
  );
  process.exit(2);
}

let failed = 0;
for (const { name, files } of clusterFiles) {
  if (files.length === 0) {
    console.log(`◦ ${name}: nenhum arquivo casou (skip)`);
    continue;
  }

  const dirty = files.filter((file) => {
    if (nocheckBaseline.has(file)) return false;
    try {
      return readFileSync(file, 'utf8').startsWith('// @ts-nocheck');
    } catch {
      return false;
    }
  });
  if (dirty.length > 0) {
    console.error(
      `✗ Cluster ${name}: @ts-nocheck detectado em ${dirty.length} arquivo(s) FORA do baseline:`
    );
    for (const file of dirty) console.error(`    ${file}`);
    failed += 1;
    continue;
  }

  const fileSet = new Set(files);
  const relevant = compilerResult.diagnostics.filter((diagnostic) => fileSet.has(diagnostic.file));
  if (relevant.length > 0) {
    console.error(`✗ Cluster ${name}: ${relevant.length} erro(s) TS`);
    for (const diagnostic of relevant.slice(0, 20)) console.error(`    ${diagnostic.rawLine}`);
    failed += 1;
  } else {
    console.log(`✓ Cluster ${name}: ${files.length} arquivo(s) — tsc limpo no escopo`);
  }
}

if (failed > 0) {
  console.error(`\n✗ ${failed} cluster(s) com dívida de tipos`);
  process.exit(1);
}
console.log(`\n✓ Todos os ${nonEmptyClusters.length} cluster(s) limpos`);
