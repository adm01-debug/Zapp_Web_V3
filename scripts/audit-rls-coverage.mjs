#!/usr/bin/env node
/**
 * E34 — RLS Coverage Audit (canonical catalog + pending migration deltas)
 *
 * The canonical self-hosted database is the source of truth. Its last verified
 * RLS state is committed in supabase/rls-catalog.json. This script initializes
 * from that catalog and then replays only migration files newer than the
 * catalog watermark, in statement order. That makes DROP POLICY, DISABLE RLS,
 * and insecure view replacements fail closed instead of being masked by an
 * older positive snapshot.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

const MIGRATION_DIR = 'supabase/migrations';
const CANONICAL_RLS_CATALOG = 'supabase/rls-catalog.json';
const LEGACY_ZAPP_SNAPSHOT = 'scripts/decouple/snapshots/zapp_schema_snapshot.sql';
const TIMESTAMP_RE = /^(\d{14})_.*\.sql$/;

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const REPORT_MODE = args.includes('--report') || (!args.includes('--check') && !JSON_MODE);
const CHECK_MODE = args.includes('--check') || process.env.CI === 'true';
const ADVISORY_MODE = args.includes('--advisory');
const REQUIRE_CANONICAL = args.includes('--require-canonical') || process.env.CI === 'true';

// 25 physical tables in zapp, verified against the canonical DB on 2026-08-31.
const CRITICAL_TABLES = new Set([
  'profiles',
  'workspaces',
  'workspace_members',
  'whatsapp_connections',
  'instance_registry',
  'user_roles',
  'departments',
  'queues',
  'queue_members',
  'audit_logs',
  'app_notifications',
  'webhook_audit_log',
  'failed_messages',
  'dispatch_error_logs',
  'sentiment_alerts',
  'evolution_sentiment_analysis',
  'voice_conversion_queue',
  'sts_telemetry',
  'agent_stats',
  'warroom_alerts',
  'sales_deals',
  'talkx_campaigns',
  'talkx_recipients',
  'team_messages',
  'calls',
]);

// Critical security_invoker views and their exact protected base relations.
// financeiro.payment_links is read-only evidence for the ZAPP proxy contract;
// this audit never mutates the financeiro schema.
const CRITICAL_VIEW_BASES = new Map([
  ['contacts', 'evo.evolution_contacts'],
  ['conversations', 'evo.evolution_conversations'],
  ['messages', 'evo.evolution_messages'],
  ['email_accounts', 'email_app.email_accounts'],
  ['email_threads', 'email_app.email_threads'],
  ['payment_links', 'financeiro.payment_links'],
]);
const CRITICAL_VIEWS = new Set(CRITICAL_VIEW_BASES.keys());
const CRITICAL_BASES = new Set(CRITICAL_VIEW_BASES.values());

const state = new Map();

function relationKey(schema, name) {
  return `${schema.toLowerCase()}.${name.toLowerCase()}`;
}

function ensureRelation(schema, name, kind = 'other') {
  const key = relationKey(schema, name);
  if (!state.has(key)) {
    state.set(key, {
      schema: schema.toLowerCase(),
      name: name.toLowerCase(),
      kind,
      exists: false,
      rlsEnabled: false,
      policies: new Map(),
      securityInvoker: null,
      source: '—',
    });
  }
  const relation = state.get(key);
  if (kind !== 'other') relation.kind = kind;
  return relation;
}

for (const table of CRITICAL_TABLES) ensureRelation('zapp', table, 'table');
for (const view of CRITICAL_VIEWS) ensureRelation('zapp', view, 'view');
for (const base of CRITICAL_BASES) {
  const [schema, name] = base.split('.');
  ensureRelation(schema, name, 'base');
}

function normalizeIdentifier(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed.toLowerCase();
}

function parseRelation(raw, defaultSchema = 'zapp') {
  const parts = [...raw.matchAll(/"(?:""|[^"])+"|`[^`]+`|'[^']+'|[A-Za-z_][\w$]*/g)]
    .map((match) => normalizeIdentifier(match[0]));
  if (parts.length >= 2) return { schema: parts.at(-2), name: parts.at(-1) };
  return { schema: defaultSchema, name: parts[0] ?? '' };
}

function targetKind(schema, name) {
  const key = relationKey(schema, name);
  if (schema.toLowerCase() === 'zapp' && CRITICAL_TABLES.has(name.toLowerCase())) return 'table';
  if (schema.toLowerCase() === 'zapp' && CRITICAL_VIEWS.has(name.toLowerCase())) return 'view';
  if (CRITICAL_BASES.has(key)) return 'base';
  return 'other';
}

let canonicalWatermark = null;
let canonicalBaselineHash = null;
let canonicalLoaded = false;

if (existsSync(CANONICAL_RLS_CATALOG)) {
  try {
    const catalog = JSON.parse(readFileSync(CANONICAL_RLS_CATALOG, 'utf8'));
    if (catalog.catalog_version !== 1 || !/^\d{14}$/.test(catalog.migration_watermark)) {
      throw new Error('catalog_version/migration_watermark inválido');
    }
    canonicalWatermark = catalog.migration_watermark;
    canonicalBaselineHash = catalog.baseline_migrations_sha256;
    if (!/^[a-f0-9]{64}$/.test(canonicalBaselineHash ?? '')) {
      throw new Error('baseline_migrations_sha256 inválido');
    }
    for (const item of catalog.relations ?? []) {
      const kind = targetKind(item.schema, item.name);
      if (kind === 'other') continue;
      const relation = ensureRelation(item.schema, item.name, kind);
      relation.exists = item.exists === true;
      relation.rlsEnabled = item.rls_enabled === true;
      relation.securityInvoker = item.security_invoker === true
        ? true
        : item.security_invoker === false
          ? false
          : null;
      relation.policies = new Map(
        (item.policies ?? []).map((policy) => [policy, { name: policy, operation: 'CATALOG', roles: [] }]),
      );
      relation.source = basename(CANONICAL_RLS_CATALOG);
    }
    canonicalLoaded = true;
  } catch (error) {
    console.error(`Cannot parse ${CANONICAL_RLS_CATALOG}: ${error.message}`);
    process.exit(1);
  }
} else if (REQUIRE_CANONICAL) {
  console.error(`Canonical RLS catalog is required in CI: ${CANONICAL_RLS_CATALOG}`);
  process.exit(1);
}

function listMigrationFiles() {
  try {
    return readdirSync(MIGRATION_DIR)
      .map((file) => ({ file, match: file.match(TIMESTAMP_RE) }))
      .filter(({ match }) => match)
      .map(({ file, match }) => ({ path: join(MIGRATION_DIR, file), version: match[1] }))
      .sort((a, b) => a.version.localeCompare(b.version) || a.path.localeCompare(b.path));
  } catch {
    console.error(`Cannot read ${MIGRATION_DIR}`);
    process.exit(1);
  }
}

const migrationFiles = listMigrationFiles();
if (canonicalLoaded) {
  const digest = createHash('sha256');
  for (const migration of migrationFiles.filter(({ version }) => version <= canonicalWatermark)) {
    digest.update(`${migration.version}:${basename(migration.path)}\0`);
    digest.update(readFileSync(migration.path));
    digest.update('\0');
  }
  const actualBaselineHash = digest.digest('hex');
  if (actualBaselineHash !== canonicalBaselineHash) {
    console.error(
      `Canonical RLS catalog baseline diverged: expected ${canonicalBaselineHash}, got ${actualBaselineHash}. Regenerate the catalog from the live DB before merging historical migration changes.`,
    );
    process.exit(1);
  }
}

const files = migrationFiles.filter(
  ({ version }) => !canonicalWatermark || version > canonicalWatermark,
);
// Local fixture/backward-compatible mode only. CI always requires the live
// catalog, so a legacy snapshot can never mask a later migration delta.
if (!canonicalLoaded && existsSync(LEGACY_ZAPP_SNAPSHOT)) {
  files.unshift({ path: LEGACY_ZAPP_SNAPSHOT, version: '00000000000000' });
}

function stripSqlComments(src) {
  let out = '';
  let index = 0;
  let mode = 'code';
  while (index < src.length) {
    const current = src[index];
    const next = src[index + 1];
    if (mode === 'code') {
      if (current === '-' && next === '-') {
        mode = 'line';
        out += '  ';
        index += 2;
        continue;
      }
      if (current === '/' && next === '*') {
        mode = 'block';
        out += '  ';
        index += 2;
        continue;
      }
      if (current === "'") mode = 'string';
      out += current;
      index += 1;
      continue;
    }
    if (mode === 'line') {
      if (current === '\n') {
        mode = 'code';
        out += current;
      } else out += ' ';
      index += 1;
      continue;
    }
    if (mode === 'block') {
      if (current === '*' && next === '/') {
        mode = 'code';
        out += '  ';
        index += 2;
        continue;
      }
      out += current === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }
    out += current;
    if (current === "'") {
      if (next === "'") {
        out += next;
        index += 2;
        continue;
      }
      mode = 'code';
    }
    index += 1;
  }
  return out;
}

const IDENT = '(?:"(?:""|[^"])+"|`[^`]+`|[A-Za-z_][\\w$]*)';
const RELATION = `${IDENT}(?:\\s*\\.\\s*${IDENT})?`;

function collectEvents(src) {
  const events = [];
  const addMatches = (regex, mapper) => {
    for (const match of src.matchAll(regex)) events.push({ index: match.index, ...mapper(match) });
  };

  addMatches(new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${RELATION})\\s+(ENABLE|DISABLE)\\s+ROW\\s+LEVEL\\s+SECURITY`, 'gi'),
    (match) => ({ type: 'rls', relation: match[1], enabled: match[2].toUpperCase() === 'ENABLE' }));
  addMatches(new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${RELATION})`, 'gi'),
    (match) => ({ type: 'create-table', relation: match[1] }));
  addMatches(new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${RELATION})`, 'gi'),
    (match) => ({ type: 'drop-table', relation: match[1] }));
  addMatches(new RegExp(`CREATE\\s+POLICY\\s+(${IDENT})\\s+ON\\s+(?:ONLY\\s+)?(${RELATION})`, 'gi'),
    (match) => ({ type: 'create-policy', policy: normalizeIdentifier(match[1]), relation: match[2] }));
  addMatches(new RegExp(`DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?(${IDENT})\\s+ON\\s+(${RELATION})`, 'gi'),
    (match) => ({ type: 'drop-policy', policy: normalizeIdentifier(match[1]), relation: match[2] }));
  addMatches(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+(${RELATION})([\\s\\S]{0,1200}?)\\bAS\\b`, 'gi'),
    (match) => ({
      type: 'create-view',
      relation: match[1],
      securityInvoker: /security_invoker\s*=\s*['"]?(?:on|true)['"]?/i.test(match[2]),
    }));
  addMatches(new RegExp(`ALTER\\s+VIEW\\s+(?:IF\\s+EXISTS\\s+)?(${RELATION})\\s+SET\\s*\\(([\\s\\S]{0,300}?)\\)`, 'gi'),
    (match) => ({
      type: 'alter-view-set',
      relation: match[1],
      securityInvoker: /security_invoker\s*=\s*['"]?(?:on|true)['"]?/i.test(match[2]),
    }));
  addMatches(new RegExp(`ALTER\\s+VIEW\\s+(?:IF\\s+EXISTS\\s+)?(${RELATION})\\s+RESET\\s*\\(([\\s\\S]{0,300}?)\\)`, 'gi'),
    (match) => ({ type: 'alter-view-reset', relation: match[1], options: match[2] }));
  addMatches(new RegExp(`DROP\\s+VIEW\\s+(?:IF\\s+EXISTS\\s+)?(${RELATION})`, 'gi'),
    (match) => ({ type: 'drop-view', relation: match[1] }));

  return events.sort((a, b) => a.index - b.index);
}

function applyEvent(event, filePath) {
  const { schema, name } = parseRelation(event.relation);
  const kind = targetKind(schema, name);
  if (kind === 'other') return;
  const relation = ensureRelation(schema, name, kind);
  relation.source = basename(filePath);

  if (event.type === 'create-table') relation.exists = true;
  if (event.type === 'drop-table') {
    relation.exists = false;
    relation.rlsEnabled = false;
    relation.policies.clear();
  }
  if (event.type === 'rls') {
    relation.exists = true;
    relation.rlsEnabled = event.enabled;
  }
  if (event.type === 'create-policy') {
    relation.exists = true;
    relation.policies.set(event.policy, { name: event.policy, operation: 'SQL', roles: [] });
  }
  if (event.type === 'drop-policy') relation.policies.delete(event.policy);
  if (event.type === 'create-view') {
    relation.exists = true;
    relation.securityInvoker = event.securityInvoker;
  }
  if (event.type === 'alter-view-set') relation.securityInvoker = event.securityInvoker;
  if (event.type === 'alter-view-reset' && /\bsecurity_invoker\b/i.test(event.options)) {
    relation.securityInvoker = false;
  }
  if (event.type === 'drop-view') {
    relation.exists = false;
    relation.securityInvoker = false;
  }
}

for (const { path } of files) {
  const source = stripSqlComments(readFileSync(path, 'utf8'));
  for (const event of collectEvents(source)) applyEvent(event, path);
}

const report = [...state.values()]
  .filter((relation) => relation.kind !== 'other')
  .sort((a, b) => relationKey(a.schema, a.name).localeCompare(relationKey(b.schema, b.name)))
  .map((relation) => {
    const policyCount = relation.policies.size;
    const status = relation.kind === 'view'
      ? relation.exists && relation.securityInvoker === true
        ? '✅ security_invoker'
        : '🔴 insecure/missing view'
      : relation.exists && relation.rlsEnabled && policyCount > 0
        ? '✅ RLS+policy'
        : !relation.exists || !relation.rlsEnabled
          ? '🔴 MISSING RLS'
          : '⚠️ RLS enabled, no policy';
    return {
      relation: relationKey(relation.schema, relation.name),
      schema: relation.schema,
      table: relation.name,
      kind: relation.kind,
      exists: relation.exists,
      rlsEnabled: relation.rlsEnabled,
      policies: policyCount,
      securityInvoker: relation.securityInvoker,
      status,
      source: relation.source,
    };
  });

if (JSON_MODE) {
  console.log(JSON.stringify({ canonicalLoaded, canonicalWatermark, report }, null, 2));
  process.exit(0);
}

if (REPORT_MODE) {
  console.log('\n## RLS Coverage Matrix (canonical catalog + pending deltas)\n');
  console.log('| Relation | Kind | RLS | Policies | Security invoker | Status | Source |');
  console.log('|----------|------|-----|----------|------------------|--------|--------|');
  for (const row of report) {
    console.log(`| ${row.relation} | ${row.kind} | ${row.rlsEnabled ? '✓' : '✗'} | ${row.policies} | ${row.securityInvoker === true ? '✓' : row.securityInvoker === false ? '✗' : '—'} | ${row.status} | ${row.source} |`);
  }
  console.log('');
}

const protectedRelations = report.filter((row) => row.kind === 'table' || row.kind === 'base');
const missing = protectedRelations.filter((row) => !row.exists || !row.rlsEnabled);
const rlsNoPolicy = protectedRelations.filter((row) => row.exists && row.rlsEnabled && row.policies === 0);
const insecureViews = report.filter(
  (row) => row.kind === 'view' && (!row.exists || row.securityInvoker !== true),
);

if (CHECK_MODE) {
  if (missing.length > 0) {
    console.error(`\n❌ RLS audit: ${missing.length} critical relation(s) without RLS:`);
    for (const row of missing) console.error(`   🔴 ${row.relation} — relation missing or RLS disabled`);
  }
  if (rlsNoPolicy.length > 0) {
    console.error(`\n❌ RLS audit: ${rlsNoPolicy.length} critical relation(s) have RLS but no policy:`);
    for (const row of rlsNoPolicy) console.error(`   🔴 ${row.relation} (from ${row.source})`);
  }
  if (insecureViews.length > 0) {
    console.error(`\n❌ RLS audit: ${insecureViews.length} critical view(s) missing security_invoker:`);
    for (const row of insecureViews) console.error(`   🔴 ${row.relation} (from ${row.source})`);
  }

  const totalGaps = missing.length + rlsNoPolicy.length + insecureViews.length;
  if (totalGaps > 0 && !ADVISORY_MODE) {
    console.error('\nCritical tables, view bases, and proxy views must preserve the canonical RLS contract.');
    process.exit(1);
  }
  if (totalGaps > 0 && ADVISORY_MODE) {
    console.warn(`::warning title=RLS audit (E34)::${totalGaps} canonical RLS contract gap(s).`);
  }
  if (totalGaps === 0) {
    console.log(`✅ RLS audit: ${CRITICAL_TABLES.size}/${CRITICAL_TABLES.size} zapp tables, ${CRITICAL_BASES.size}/${CRITICAL_BASES.size} view bases, and ${CRITICAL_VIEWS.size}/${CRITICAL_VIEWS.size} security_invoker views protected.`);
  }
}
