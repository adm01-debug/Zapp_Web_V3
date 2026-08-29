#!/usr/bin/env node
/**
 * compare-schema-catalog.mjs
 * ------------------------------------------------------------------
 * Compara dois arquivos de catálogo JSON, opcionalmente ignorando o bloco
 * `source` para validar apenas o contrato materializado.
 *
 * Uso:
 *   node scripts/compare-schema-catalog.mjs \
 *     --left supabase/schema-catalog.json \
 *     --right reports/schema-catalog.live.json \
 *     --ignore-source
 */
import { existsSync, readFileSync } from 'node:fs';

function readFlag(name) {
  const prefix = `--${name}=`;
  const eq = process.argv.find((arg) => arg.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith('--')) return next;
  }
  return '';
}

const LEFT_FILE = readFlag('left');
const RIGHT_FILE = readFlag('right');
const IGNORE_SOURCE = process.argv.includes('--ignore-source');

if (!LEFT_FILE || !RIGHT_FILE) {
  console.error('Uso: --left <arquivo> --right <arquivo> [--ignore-source]');
  process.exit(1);
}

if (!existsSync(LEFT_FILE)) {
  console.error(`::error title=Schema catalog ausente::${LEFT_FILE} não existe.`);
  process.exit(1);
}

if (!existsSync(RIGHT_FILE)) {
  console.error(`::error title=Schema catalog ausente::${RIGHT_FILE} não existe.`);
  process.exit(1);
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortObject(value[key])]),
    );
  }
  return value;
}

function normalizeCatalog(catalog) {
  const clone = JSON.parse(JSON.stringify(catalog));
  if (IGNORE_SOURCE) delete clone.source;
  return sortObject(clone);
}

const leftCatalog = JSON.parse(readFileSync(LEFT_FILE, 'utf8'));
const rightCatalog = JSON.parse(readFileSync(RIGHT_FILE, 'utf8'));

const leftNormalized = JSON.stringify(normalizeCatalog(leftCatalog));
const rightNormalized = JSON.stringify(normalizeCatalog(rightCatalog));

if (leftNormalized !== rightNormalized) {
  console.error(
    `::error title=Schema catalog stale::${LEFT_FILE} divergiu de ${RIGHT_FILE}${IGNORE_SOURCE ? ' (ignorando source)' : ''}.`,
  );
  process.exit(1);
}

console.log(
  `✓ ${LEFT_FILE} confere com ${RIGHT_FILE}${IGNORE_SOURCE ? ' (ignorando source)' : ''}.`,
);
