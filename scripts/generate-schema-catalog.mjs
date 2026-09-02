#!/usr/bin/env node
/**
 * generate-schema-catalog.mjs
 * ------------------------------------------------------------------
 * Gera um catálogo estável do schema a partir de `src/integrations/supabase/types.ts`
 * (fonte local versionada) ou diretamente do postgres-meta (fonte viva em CI).
 *
 * Objetivos:
 *   1. Materializar uma visão canônica, ordenada e diffável do contrato do banco.
 *   2. Permitir um gate de "freshness" em CI: gera de novo e compara com o JSON commitado.
 *   3. Não depender de dependências externas além do Node.
 *
 * Modos:
 *   - padrão: lê o arquivo local `src/integrations/supabase/types.ts`
 *   - --from-meta: baixa o typescript do postgres-meta (requer META_URL/META_TOKEN)
 *
 * Flags:
 *   --types-file <path>   Arquivo types.ts de entrada (default: src/integrations/supabase/types.ts)
 *   --out <path>          Arquivo de saída (default: supabase/schema-catalog.json)
 *   --schemas <csv>       Filtra schemas de topo (default: todos os presentes em Database)
 *   --from-meta           Busca o types.ts do postgres-meta em vez de ler arquivo local
 *   --compare-file <path> Compara o catálogo gerado com outro catálogo JSON
 *   --ignore-source       Ignora o bloco `source` na comparação entre catálogos
 *   --check               Compara a saída gerada com o arquivo em --out e falha se divergir
 *
 * Exit codes:
 *   0 = ok
 *   1 = divergência em --check ou erro de uso
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const DEFAULT_TYPES_FILE = 'src/integrations/supabase/types.ts';
const DEFAULT_OUT_FILE = 'supabase/schema-catalog.json';
const DEFAULT_EXTERNAL_OBJECTS_FILE = 'supabase/schema-catalog-external-objects.json';

function readFlag(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const eq = process.argv.find((arg) => arg.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith('--')) return next;
  }
  return fallback;
}

const TYPES_FILE = readFlag('types-file', DEFAULT_TYPES_FILE);
const OUT_FILE = readFlag('out', DEFAULT_OUT_FILE);
const COMPARE_FILE = readFlag('compare-file', '');
const SCHEMAS_FILTER = (readFlag('schemas', '') || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const FROM_META = process.argv.includes('--from-meta');
const CHECK_ONLY = process.argv.includes('--check');
const IGNORE_SOURCE = process.argv.includes('--ignore-source');
const EXTERNAL_OBJECTS_FILE = readFlag('external-objects-file', DEFAULT_EXTERNAL_OBJECTS_FILE);

function sha1(input) {
  return createHash('sha1').update(input).digest('hex');
}

// O catálogo canônico (gerado a partir do types.ts commitado, nunca via
// --from-meta) não pode conter objetos que schema-catalog-external-objects.json
// declara "right-only" (pertencem a outro sistema que compartilha o schema
// `public` — ex.: o financeiro externo). O postgres-meta não distingue "dono"
// ao introspectar `public`, então tanto o types.ts quanto um catálogo gerado
// ao vivo (--from-meta) sempre os incluem; sem este filtro, o gate "Catalog
// fresh" (db-guard.yml) trava porque compare-schema-catalog.mjs espera esses
// objetos ausentes do lado esquerdo (o catálogo commitado) e presentes só no
// lado direito (o catálogo ao vivo, que continua sem filtro nenhum aqui).
function loadExternalObjectsAllowlist(file) {
  if (!file || !existsSync(file)) return [];
  try {
    const config = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(config?.objects) ? config.objects : [];
  } catch {
    return [];
  }
}

function stripRightOnlyExternalObjects(catalog, entries) {
  let removed = 0;
  for (const entry of entries) {
    if (entry.expected_presence !== 'right-only') continue;
    const parts = entry.path.split('.');
    let cursor = catalog;
    let reachable = true;
    for (const part of parts.slice(0, -1)) {
      if (!cursor || typeof cursor !== 'object' || !(part in cursor)) {
        reachable = false;
        break;
      }
      cursor = cursor[part];
    }
    const leafKey = parts.at(-1);
    if (reachable && cursor && typeof cursor === 'object' && leafKey in cursor) {
      delete cursor[leafKey];
      removed++;
    }
  }
  return removed;
}

function recomputeSummary(catalog) {
  const schemas = catalog.schemas || {};
  catalog.summary = {
    schemas: Object.keys(schemas).length,
    tables: 0,
    views: 0,
    functions: 0,
    enums: 0,
    composite_types: 0,
  };
  for (const schema of Object.values(schemas)) {
    catalog.summary.tables += Object.keys(schema.Tables || {}).length;
    catalog.summary.views += Object.keys(schema.Views || {}).length;
    catalog.summary.functions += Object.keys(schema.Functions || {}).length;
    catalog.summary.enums += Object.keys(schema.Enums || {}).length;
    catalog.summary.composite_types += Object.keys(schema.CompositeTypes || {}).length;
  }
}

function stripQuotes(value) {
  return value.replace(/^"|"$/g, '');
}

function parseEntryLine(line) {
  if (!line.startsWith('      ')) return null;
  const body = line.slice(6);
  let squareDepth = 0;
  let quote = false;

  for (let index = 0; index < body.length; index++) {
    const ch = body[index];
    if (ch === '"') quote = !quote;
    if (!quote) {
      if (ch === '[') squareDepth++;
      else if (ch === ']') squareDepth = Math.max(0, squareDepth - 1);
      else if (ch === ':' && squareDepth === 0) {
        const key = body.slice(0, index).trim();
        const rest = body.slice(index + 1).trimStart();
        return { key, rest };
      }
    }
  }
  return null;
}

function countBraces(line) {
  let depth = 0;
  for (const ch of line) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return depth;
}

async function loadTypesSource() {
  if (!FROM_META) {
    if (!existsSync(TYPES_FILE)) {
      throw new Error(`Arquivo não encontrado: ${TYPES_FILE}`);
    }
    return {
      source: {
        kind: 'types-file',
        path: TYPES_FILE,
      },
      text: readFileSync(TYPES_FILE, 'utf8'),
    };
  }

  const metaUrl = process.env.META_URL || process.env.ZAPP_META_URL;
  const metaToken = process.env.META_TOKEN || process.env.ZAPP_META_TOKEN;
  const schemas = SCHEMAS_FILTER.length ? SCHEMAS_FILTER.join(',') : 'public,zapp,evo,email_app';

  if (!metaUrl || !metaToken) {
    throw new Error('META_URL/ZAPP_META_URL e META_TOKEN/ZAPP_META_TOKEN são obrigatórios com --from-meta');
  }

  const headers = {
    apikey: metaToken,
    authorization: `Bearer ${metaToken}`,
  };
  const url = new URL((metaUrl.endsWith('/') ? metaUrl : `${metaUrl}/`) + 'generators/typescript');
  url.searchParams.set('included_schemas', schemas);
  url.searchParams.set('detect_one_to_one_relationships', 'true');

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`postgres-meta HTTP ${response.status}: ${await response.text()}`);
  }

  let text = await response.text();
  try {
    const payload = JSON.parse(text);
    text = payload.types || payload.data || text;
  } catch {
    // Resposta já veio como typescript cru.
  }

  return {
    source: {
      kind: 'postgres-meta',
      url: url.toString(),
      schemas_requested: schemas.split(',').map((schema) => schema.trim()).filter(Boolean),
    },
    text,
  };
}

function parseColumns(lines, startIndex, closingIndent) {
  const columns = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (line === closingIndent) {
      return { columns, nextIndex: index + 1 };
    }
    const match = line.match(/^\s{10}([A-Za-z_][A-Za-z0-9_]*)\??:\s+(.+)$/);
    if (match) {
      columns.push({ name: match[1], type: match[2].trim() });
    }
    index++;
  }
  return { columns, nextIndex: index };
}

function parseFunctionEntry(block) {
  const lines = block.split('\n');
  const overloads = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const inlineNever = line.match(/Args:\s+never\s*;\s*Returns:\s+(.+)$/);
    if (inlineNever) {
      overloads.push({ args: [], returns: normalizeInlineReturn(inlineNever[1]) });
      continue;
    }

    const argsNever = line.match(/Args:\s+never/);
    if (argsNever) {
      const returns = parseReturns(lines, index + 1);
      overloads.push({ args: [], returns });
      continue;
    }

    const argsInline = line.match(/Args:\s+\{\s*(.*?)\s*\}\s*;\s*Returns:\s+(.+)$/);
    if (argsInline) {
      overloads.push({
        args: parseInlineArgs(argsInline[1]),
        returns: normalizeInlineReturn(argsInline[2]),
      });
      continue;
    }

    if (/Args:\s+\{$/.test(line)) {
      const args = [];
      index++;
      while (index < lines.length && !/^\s{8}\}$/.test(lines[index]) && !/^\s{12}\}$/.test(lines[index])) {
        const argMatch = lines[index].match(/^\s{10,12}([A-Za-z_][A-Za-z0-9_]*)\??:\s+(.+)$/);
        if (argMatch) args.push({ name: argMatch[1], type: argMatch[2].trim() });
        index++;
      }
      const returns = parseReturns(lines, index + 1);
      overloads.push({ args, returns });
    }
  }

  return {
    overload_count: overloads.length,
    overloads,
    definition_sha1: sha1(normalizeBlock(block)),
  };
}

function parseInlineArgs(raw) {
  if (!raw.trim()) return [];
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\??:\s+(.+)$/);
      return match ? { name: match[1], type: match[2].trim() } : { name: part, type: 'unknown' };
    });
}

function normalizeInlineReturn(raw) {
  return raw.replace(/\s+\}$/, '').trim();
}

function parseReturns(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index];
    const inline = line.match(/Returns:\s+(.+)$/);
    if (inline) {
      const value = inline[1].trim();
      if (value === '{') {
        const fields = [];
        index++;
        while (
          index < lines.length &&
          !/^\s{8}\}(?:\[\])?$/.test(lines[index]) &&
          !/^\s{12}\}(?:\[\])?$/.test(lines[index])
        ) {
          const fieldMatch = lines[index].match(/^\s{10,12}([A-Za-z_][A-Za-z0-9_]*)\??:\s+(.+)$/);
          if (fieldMatch) fields.push({ name: fieldMatch[1], type: fieldMatch[2].trim() });
          index++;
        }
        const suffix = /\[\]$/.test(lines[index] || '') ? '[]' : '';
        return { kind: suffix ? 'object[]' : 'object', fields };
      }
      return value;
    }
  }
  return 'unknown';
}

function normalizeBlock(block) {
  return block
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function parseRelationEntry(block, kind) {
  const lines = block.split('\n');
  const row = [];
  const insert = [];
  const update = [];
  const relationshipCount = lines.filter((line) => /referencedRelation:/.test(line)).length;

  for (let index = 0; index < lines.length; index++) {
    if (/^\s{8}Row: \{$/.test(lines[index])) {
      const parsed = parseColumns(lines, index + 1, '        }');
      row.push(...parsed.columns);
      index = parsed.nextIndex - 1;
      continue;
    }
    if (/^\s{8}Insert: \{$/.test(lines[index])) {
      const parsed = parseColumns(lines, index + 1, '        }');
      insert.push(...parsed.columns);
      index = parsed.nextIndex - 1;
      continue;
    }
    if (/^\s{8}Update: \{$/.test(lines[index])) {
      const parsed = parseColumns(lines, index + 1, '        }');
      update.push(...parsed.columns);
      index = parsed.nextIndex - 1;
    }
  }

  return {
    kind,
    row_columns: row,
    insert_columns: insert,
    update_columns: update,
    relationship_count: relationshipCount,
    definition_sha1: sha1(normalizeBlock(block)),
  };
}

function parseEnumEntry(raw) {
  return raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^"|"$/g, ''));
}

function captureEntry(lines, startIndex) {
  const firstLine = lines[startIndex];
  const captured = [firstLine];
  const firstTrimmed = firstLine.trimEnd();
  let index = startIndex + 1;
  let depth = countBraces(firstTrimmed);

  if (depth > 0) {
    while (index < lines.length) {
      captured.push(lines[index]);
      depth += countBraces(lines[index]);
      index++;
      if (depth === 0) break;
    }
    return { block: captured.join('\n'), nextIndex: index };
  }

  while (index < lines.length) {
    const line = lines[index];
    if (/^      [A-Za-z_"][A-Za-z0-9_"]*:\s*/.test(line) || /^    \}/.test(line)) {
      break;
    }
    captured.push(line);
    index++;
  }
  return { block: captured.join('\n'), nextIndex: index };
}

function parseSection(lines, startIndex, sectionName) {
  const entries = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line === '    }') {
      return { entries, nextIndex: index + 1 };
    }

    const entry = parseEntryLine(line);
    if (!entry) {
      index++;
      continue;
    }

    const name = stripQuotes(entry.key);
    if (name === '[_ in never]') {
      index++;
      continue;
    }

    if (sectionName === 'Enums') {
      entries[name] = parseEnumEntry(entry.rest);
      index++;
      continue;
    }

    const { block, nextIndex } = captureEntry(lines, index);
    if (sectionName === 'Tables' || sectionName === 'Views') {
      entries[name] = parseRelationEntry(block, sectionName === 'Tables' ? 'table' : 'view');
    } else if (sectionName === 'Functions') {
      entries[name] = parseFunctionEntry(block);
    } else {
      entries[name] = {
        definition_sha1: sha1(normalizeBlock(block)),
      };
    }
    index = nextIndex;
  }

  return { entries, nextIndex: index };
}

function parseDatabaseTypes(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line === 'export type Database = {');
  if (start === -1) {
    throw new Error('Bloco `export type Database = {` não encontrado.');
  }

  const schemas = {};
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line === '}') break;

    const schemaMatch = line.match(/^  ([A-Za-z_][A-Za-z0-9_]*)\: \{$/);
    if (!schemaMatch) {
      index++;
      continue;
    }

    const schemaName = schemaMatch[1];
    const schema = { Tables: {}, Views: {}, Functions: {}, Enums: {}, CompositeTypes: {} };
    index++;

    while (index < lines.length) {
      const innerLine = lines[index];
      if (innerLine === '  }') break;

      const sectionMatch = innerLine.match(/^    (Tables|Views|Functions|Enums|CompositeTypes): \{$/);
      if (!sectionMatch) {
        index++;
        continue;
      }

      const sectionName = sectionMatch[1];
      const parsed = parseSection(lines, index + 1, sectionName);
      schema[sectionName] = parsed.entries;
      index = parsed.nextIndex;
    }

    schemas[schemaName] = schema;
    index++;
  }

  return schemas;
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortObject(value[key])]),
    );
  }
  return value;
}

function buildCatalog(parsedSchemas, sourceInfo, sourceText) {
  const selectedSchemaNames = SCHEMAS_FILTER.length
    ? Object.keys(parsedSchemas).filter((schema) => SCHEMAS_FILTER.includes(schema))
    : Object.keys(parsedSchemas);

  const filteredSchemas = {};
  for (const schemaName of selectedSchemaNames.sort()) {
    filteredSchemas[schemaName] = parsedSchemas[schemaName];
  }

  const summary = {
    schemas: selectedSchemaNames.length,
    tables: 0,
    views: 0,
    functions: 0,
    enums: 0,
    composite_types: 0,
  };

  for (const schemaName of selectedSchemaNames) {
    const schema = filteredSchemas[schemaName];
    summary.tables += Object.keys(schema.Tables || {}).length;
    summary.views += Object.keys(schema.Views || {}).length;
    summary.functions += Object.keys(schema.Functions || {}).length;
    summary.enums += Object.keys(schema.Enums || {}).length;
    summary.composite_types += Object.keys(schema.CompositeTypes || {}).length;
  }

  return sortObject({
    schema_catalog_version: 1,
    source: {
      ...sourceInfo,
      types_sha1: sha1(sourceText),
    },
    summary,
    schemas: filteredSchemas,
  });
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function normalizeCatalogForComparison(catalog) {
  if (!IGNORE_SOURCE) return sortObject(catalog);

  const clone = JSON.parse(JSON.stringify(catalog));
  delete clone.source;
  return sortObject(clone);
}

function compareCatalogs(leftCatalog, rightCatalog, leftLabel, rightLabel) {
  const normalizedLeft = stableStringify(normalizeCatalogForComparison(leftCatalog));
  const normalizedRight = stableStringify(normalizeCatalogForComparison(rightCatalog));

  if (normalizedLeft !== normalizedRight) {
    console.error(
      `::error title=Schema catalog stale::${leftLabel} divergiu de ${rightLabel}.`,
    );
    process.exit(1);
  }
}

async function main() {
  const { source, text } = await loadTypesSource();
  const parsed = parseDatabaseTypes(text);
  const catalog = buildCatalog(parsed, source, text);

  if (!FROM_META) {
    const externalObjects = loadExternalObjectsAllowlist(EXTERNAL_OBJECTS_FILE);
    const removed = stripRightOnlyExternalObjects(catalog, externalObjects);
    if (removed > 0) recomputeSummary(catalog);
  }

  const output = stableStringify(catalog);

  if (CHECK_ONLY) {
    if (!existsSync(OUT_FILE)) {
      console.error(`::error title=Schema catalog ausente::${OUT_FILE} não existe.`);
      process.exit(1);
    }
    const current = readFileSync(OUT_FILE, 'utf8');
    if (current !== output) {
      console.error(`::error title=Schema catalog stale::${OUT_FILE} divergiu da geração canônica.`);
      process.exit(1);
    }
    console.log(`✓ ${OUT_FILE} está fresco.`);
    return;
  }

  mkdirSync(dirname(resolve(OUT_FILE)), { recursive: true });
  writeFileSync(OUT_FILE, output);

  if (COMPARE_FILE) {
    if (!existsSync(COMPARE_FILE)) {
      console.error(`::error title=Schema catalog ausente::${COMPARE_FILE} não existe.`);
      process.exit(1);
    }
    const compareTarget = JSON.parse(readFileSync(COMPARE_FILE, 'utf8'));
    compareCatalogs(catalog, compareTarget, OUT_FILE, COMPARE_FILE);
    console.log(
      `✓ ${OUT_FILE} confere com ${COMPARE_FILE}${IGNORE_SOURCE ? ' (ignorando source)' : ''}.`,
    );
  }

  console.log(`✓ Catálogo gerado em ${OUT_FILE}`);
  console.log(`  Fonte: ${source.kind}`);
  console.log(`  Schemas: ${catalog.summary.schemas} | Tables: ${catalog.summary.tables} | Views: ${catalog.summary.views} | Functions: ${catalog.summary.functions}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
