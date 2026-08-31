#!/usr/bin/env node
/**
 * compare-schema-catalog.mjs
 * ------------------------------------------------------------------
 * Compara dois arquivos de catálogo JSON, opcionalmente ignorando o bloco
 * `source` e objetos externos explicitamente declarados para validar apenas o
 * contrato materializado pertencente ao Zapp.
 *
 * Uso:
 *   node scripts/compare-schema-catalog.mjs \
 *     --left supabase/schema-catalog.json \
 *     --right reports/schema-catalog.live.json \
 *     --ignore-source \
 *     --external-objects-file supabase/schema-catalog-external-objects.json
 */
import { existsSync, readFileSync } from 'node:fs';

const EXTERNAL_OBJECT_PATH =
  /^schemas\.public\.(Tables|Views|Functions|Enums|CompositeTypes)\.([A-Za-z_][A-Za-z0-9_]*)$/;
const EXPECTED_PRESENCES = new Set(['left-only', 'right-only']);

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
const EXTERNAL_OBJECTS_FILE = readFlag('external-objects-file');
const IGNORE_SOURCE = process.argv.includes('--ignore-source');

if (!LEFT_FILE || !RIGHT_FILE) {
  console.error(
    'Uso: --left <arquivo> --right <arquivo> [--ignore-source] [--external-objects-file <arquivo>]',
  );
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

if (EXTERNAL_OBJECTS_FILE && !existsSync(EXTERNAL_OBJECTS_FILE)) {
  console.error(
    `::error title=Allowlist de objetos externos ausente::${EXTERNAL_OBJECTS_FILE} não existe.`,
  );
  process.exit(1);
}

function fail(title, message) {
  console.error(`::error title=${title}::${message}`);
  process.exit(1);
}

function readJsonFile(file, title) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(title, `${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadExternalObjects(file) {
  if (!file) return [];

  const config = readJsonFile(file, 'Allowlist de objetos externos inválida');
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail('Allowlist de objetos externos inválida', `${file} deve conter um objeto JSON.`);
  }
  if (config.version !== 1 || !Array.isArray(config.objects)) {
    fail(
      'Allowlist de objetos externos inválida',
      `${file} exige version=1 e um array objects.`,
    );
  }

  const seenPaths = new Set();
  for (const [index, entry] of config.objects.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('Allowlist de objetos externos inválida', `objects[${index}] deve ser um objeto.`);
    }

    const { path, owner, reason, expected_presence: expectedPresence } = entry;
    if (typeof path !== 'string' || !EXTERNAL_OBJECT_PATH.test(path)) {
      fail(
        'Escopo externo inválido',
        `objects[${index}].path deve apontar para um objeto inteiro em schemas.public.`,
      );
    }
    if (seenPaths.has(path)) {
      fail('Allowlist de objetos externos inválida', `caminho duplicado: ${path}.`);
    }
    if (typeof owner !== 'string' || !owner.startsWith('external-')) {
      fail(
        'Allowlist de objetos externos inválida',
        `${path} exige owner iniciado por external-.`,
      );
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      fail('Allowlist de objetos externos inválida', `${path} exige reason não vazio.`);
    }
    if (!EXPECTED_PRESENCES.has(expectedPresence)) {
      fail(
        'Allowlist de objetos externos inválida',
        `${path} exige expected_presence igual a left-only ou right-only.`,
      );
    }
    seenPaths.add(path);
  }

  return config.objects;
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

function cloneCatalog(catalog) {
  const clone = JSON.parse(JSON.stringify(catalog));
  if (IGNORE_SOURCE) delete clone.source;
  return clone;
}

function hasPath(object, parts) {
  let cursor = object;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !Object.hasOwn(cursor, part)) return false;
    cursor = cursor[part];
  }
  return true;
}

function deletePath(object, parts) {
  let cursor = object;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  delete cursor[parts.at(-1)];
}

function presenceOf(leftHasPath, rightHasPath) {
  if (leftHasPath && rightHasPath) return 'both';
  if (leftHasPath) return 'left-only';
  if (rightHasPath) return 'right-only';
  return 'absent';
}

function recomputeSummary(catalog) {
  const schemas = catalog.schemas || {};
  const summary = {
    schemas: Object.keys(schemas).length,
    tables: 0,
    views: 0,
    functions: 0,
    enums: 0,
    composite_types: 0,
  };

  for (const schema of Object.values(schemas)) {
    summary.tables += Object.keys(schema.Tables || {}).length;
    summary.views += Object.keys(schema.Views || {}).length;
    summary.functions += Object.keys(schema.Functions || {}).length;
    summary.enums += Object.keys(schema.Enums || {}).length;
    summary.composite_types += Object.keys(schema.CompositeTypes || {}).length;
  }
  catalog.summary = summary;
}

function removeExternalObjects(leftCatalog, rightCatalog, entries) {
  for (const entry of entries) {
    const parts = entry.path.split('.');
    const leftHasPath = hasPath(leftCatalog, parts);
    const rightHasPath = hasPath(rightCatalog, parts);
    const actualPresence = presenceOf(leftHasPath, rightHasPath);

    if (actualPresence !== entry.expected_presence) {
      fail(
        'Presença de objeto externo inesperada',
        `${entry.path}: esperado ${entry.expected_presence}, encontrado ${actualPresence}.`,
      );
    }

    if (leftHasPath) deletePath(leftCatalog, parts);
    if (rightHasPath) deletePath(rightCatalog, parts);
  }

  if (entries.length > 0) {
    recomputeSummary(leftCatalog);
    recomputeSummary(rightCatalog);
  }
}

const externalObjects = loadExternalObjects(EXTERNAL_OBJECTS_FILE);
const leftCatalog = cloneCatalog(readJsonFile(LEFT_FILE, 'Schema catalog inválido'));
const rightCatalog = cloneCatalog(readJsonFile(RIGHT_FILE, 'Schema catalog inválido'));

removeExternalObjects(leftCatalog, rightCatalog, externalObjects);

const leftNormalized = JSON.stringify(sortObject(leftCatalog));
const rightNormalized = JSON.stringify(sortObject(rightCatalog));

if (leftNormalized !== rightNormalized) {
  console.error(
    `::error title=Schema catalog stale::${LEFT_FILE} divergiu de ${RIGHT_FILE}${IGNORE_SOURCE ? ' (ignorando source)' : ''}.`,
  );
  process.exit(1);
}

console.log(
  `✓ ${LEFT_FILE} confere com ${RIGHT_FILE}${IGNORE_SOURCE ? ' (ignorando source)' : ''}${externalObjects.length ? ` (ignorando ${externalObjects.length} objetos externos declarados)` : ''}.`,
);
