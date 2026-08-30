#!/usr/bin/env node
/**
 * E34 — RLS Coverage Audit (static, migration-derived)
 *
 * Parses supabase/migrations/*.sql to build a table × role × operation
 * coverage matrix. Outputs a machine-readable summary and blocks CI
 * when critical app tables are missing RLS enablement in migrations.
 *
 * NOTE: This is a static approximation. The authoritative check is the
 * rls-role-matrix.test.ts suite that runs against a live DB. This script
 * is the fast shift-left gate — catches missing ENABLE ROW LEVEL SECURITY
 * and GRANT statements before any DB connection is required.
 *
 * Output modes:
 *   --report   Print full coverage table (default in local mode)
 *   --check    Exit 1 if critical tables are uncovered (default in CI)
 *   --json     Emit JSON for downstream consumption
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const MIGRATION_DIR = 'supabase/migrations';
const TIMESTAMP_RE = /^\d{14}_.*\.sql$/;

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const REPORT_MODE = args.includes('--report') || (!args.includes('--check') && !JSON_MODE);
const CHECK_MODE = args.includes('--check') || process.env.CI === 'true';
// --advisory: reporta as falhas como ::warning:: e sai 0. Usado no CI enquanto
// a reconciliação migrations×banco das tabelas críticas sem evidência não
// fecha (evidência 008 mediu 14/31 reais). Endurecer removendo a flag do
// step do quality-gate após a reconciliação (rastreado na evidência 009).
const ADVISORY_MODE = args.includes('--advisory');

// Critical app tables that MUST have RLS enabled.
// 28 tabelas físicas (relkind='r') no schema zapp — audit 2026-07-16, com
// cross-check DB de 2026-08-30 (evidência 009) que reclassificou 3 entradas
// como views security_invoker (ver CRITICAL_VIEWS abaixo).
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
  'payment_links',
  'email_accounts',
  'email_threads',
]);

// G8-5 (2026-08-30): zapp.contacts / zapp.conversations / zapp.messages NÃO
// são tabelas físicas — são views security_invoker sobre evo.evolution_*.
// Views não aceitam ENABLE ROW LEVEL SECURITY, então a recomendação que o
// --check emitia para elas ("add ALTER TABLE ... ENABLE ROW LEVEL SECURITY")
// era tecnicamente inválida. A proteção vem das tabelas base evo.* (RLS
// confirmado no cross-check DB de 2026-08-30) e é validada pela suíte viva
// rls-role-matrix.test.ts. Elas seguem no relatório como 🔎 view e ficam
// fora do cálculo de falha do gate.
const CRITICAL_VIEWS = new Set(['contacts', 'conversations', 'messages']);

// Roles recognized in policy definitions
const KNOWN_ROLES = ['anon', 'authenticated', 'service_role', 'supabase_admin'];

// Accumulate state across all migrations
const state = {
  // table -> { rlsEnabled, policies: [{ name, role, operations }], grants: [] }
  tables: new Map(),
  // Track which migration enabled RLS per table
  rlsSource: new Map(),
};

function ensureTable(name) {
  if (!state.tables.has(name)) {
    state.tables.set(name, { rlsEnabled: false, policies: [], grants: [] });
  }
  return state.tables.get(name);
}

function canonicalTable(raw) {
  // Strip schema prefix for tracking
  return raw.replace(/^(zapp|public|evo|email_app|financeiro|vendas|ops|ai|bpm|archive)\./i, '')
            .toLowerCase()
            .trim();
}

// E34 fix (2026-08-30, G7): materializa TODAS as tabelas críticas antes do
// parse. Sem isto, uma tabela crítica nunca mencionada em supabase/migrations
// (nem em migrations/archive/) ficava fora do relatório e do cálculo de
// falha — o --check saía verde com cobertura ilusória (14/31 na evidência
// 008). Com a materialização, ausência de evidência vira 🔴 MISSING RLS.
for (const t of CRITICAL_TABLES) ensureTable(t);
// Views security_invoker críticas aparecem no relatório (🔎), mas fora do
// cálculo de falha — ver CRITICAL_VIEWS.
for (const v of CRITICAL_VIEWS) ensureTable(v);

let files;
try {
  // R25 fix: varre também supabase/migrations/archive/ — o #628 (baseline)
  // arquivou 966 migrations que contêm o ENABLE ROW LEVEL SECURITY das
  // tabelas ativas (o banco real está correto; o gate sem archive dava
  // falso-positivo em 10 tabelas críticas).
  // archive/ é opcional: se não existir, skip silencioso.
  files = readdirSync(MIGRATION_DIR)
    .filter(f => TIMESTAMP_RE.test(f))
    .sort()
    .map(f => join(MIGRATION_DIR, f));

  const archiveDir = join(MIGRATION_DIR, 'archive');
  try {
    const archiveFiles = readdirSync(archiveDir)
      .filter(f => TIMESTAMP_RE.test(f))
      .sort()
      .map(f => join(archiveDir, f));
    files = files.concat(archiveFiles);
  } catch {
    // archive/ não existe neste repo — ignorar silenciosamente
  }
} catch {
  console.error(`Cannot read ${MIGRATION_DIR}`);
  process.exit(1);
}

// G8-3 (2026-08-30): comentários SQL NÃO são evidência. Antes deste fix,
// `-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY` e blocos /* ... */ eram
// parseados como DDL real — falso-positivo inaceitável num gate de
// segurança. O strip preserva o conteúdo de string literals ('...' com
// escape ''), mantendo visível o DDL dinâmico emitido via EXECUTE '...'
// (ex.: criação dinâmica de partições). Newlines são preservados para não
// fundir tokens de linhas distintas.
function stripSqlComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line | block | string
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (state === 'code') {
      if (c === '-' && next === '-') {
        state = 'line';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '/' && next === '*') {
        state = 'block';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'string';
      }
      out += c;
      i += 1;
      continue;
    }
    if (state === 'line') {
      if (c === '\n') {
        state = 'code';
        out += c;
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 2;
        continue;
      }
      out += c === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }
    // string literal: preserva; '' é escape de aspa dentro de string
    out += c;
    if (c === "'") {
      if (next === "'") {
        out += next;
        i += 2;
        continue;
      }
      state = 'code';
    }
    i += 1;
  }
  return out;
}

for (const filePath of files) {
  const src = stripSqlComments(readFileSync(filePath, 'utf8'));
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect: ALTER TABLE [IF EXISTS] [ONLY] [schema.]table ENABLE ROW LEVEL SECURITY
    // G8-4 (2026-08-30): a gramática aceita ONLY (ALTER TABLE [IF EXISTS]
    // [ONLY] name); sem ele o gate perdia evidência válida (falso-negativo).
    const rlsMatch = line.match(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([`"'\w.]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
    );
    if (rlsMatch) {
      const tbl = canonicalTable(rlsMatch[1].replace(/[`"']/g, ''));
      ensureTable(tbl).rlsEnabled = true;
      state.rlsSource.set(tbl, basename(filePath));
    }

    // Detect: CREATE POLICY ... ON [schema.]table [AS ...] FOR ... TO ...
    const policyMatch = line.match(
      /CREATE\s+POLICY\s+["']?(\w+)["']?\s+ON\s+(?:ONLY\s+)?([`"'\w.]+)/i
    );
    if (policyMatch) {
      const policyName = policyMatch[1];
      const tbl = canonicalTable(policyMatch[2].replace(/[`"']/g, ''));
      const rec = ensureTable(tbl);

      // Look ahead for TO role and FOR operation
      const windowEnd = Math.min(i + 10, lines.length);
      const block = lines.slice(i, windowEnd).join(' ');

      const forMatch = block.match(/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i);
      const toMatch = block.match(/\bTO\s+([\w,\s]+?)(?:\s+USING|\s+WITH\s+CHECK|;|$)/i);

      const operation = forMatch ? forMatch[1].toUpperCase() : 'ALL';
      const roles = toMatch
        ? toMatch[1].split(',').map(r => r.trim().toLowerCase()).filter(Boolean)
        : ['authenticated'];

      rec.policies.push({ name: policyName, operation, roles });
    }

    // Detect: GRANT SELECT|INSERT|UPDATE|DELETE|ALL ON TABLE [schema.]table TO role
    const grantMatch = line.match(
      /GRANT\s+([\w,\s]+?)\s+ON\s+(?:TABLE\s+)?([`"'\w.]+)\s+TO\s+([\w,\s]+)/i
    );
    if (grantMatch) {
      const ops = grantMatch[1].trim().toUpperCase();
      const tbl = canonicalTable(grantMatch[2].replace(/[`"']/g, ''));
      const roles = grantMatch[3].split(',').map(r => r.trim().toLowerCase());
      ensureTable(tbl).grants.push({ ops, roles });
    }
  }
}

// Build coverage report
const report = [];
for (const [table, info] of [...state.tables.entries()].sort()) {
  const isCritical = CRITICAL_TABLES.has(table);
  const isCriticalView = CRITICAL_VIEWS.has(table);
  const hasAnyPolicy = info.policies.length > 0;
  const coveredOps = new Set(info.policies.map(p => p.operation));
  const coveredRoles = new Set(info.policies.flatMap(p => p.roles));

  const status = isCriticalView
    ? '🔎 view security_invoker (RLS na base evo.*)'
    : info.rlsEnabled
      ? (hasAnyPolicy ? '✅ RLS+policy' : '⚠️  RLS enabled, no policy')
      : (isCritical ? '🔴 MISSING RLS' : '⬜ no RLS');

  report.push({
    table,
    critical: isCritical,
    criticalView: isCriticalView,
    rlsEnabled: info.rlsEnabled,
    policies: info.policies.length,
    coveredOps: [...coveredOps].join(', ') || '—',
    coveredRoles: [...coveredRoles].join(', ') || '—',
    status,
    rlsSource: state.rlsSource.get(table) || '—',
  });
}

if (JSON_MODE) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (REPORT_MODE) {
  console.log('\n## RLS Coverage Matrix (migration-derived)\n');
  console.log('| Table | Critical | RLS | Policies | Ops | Roles | Status |');
  console.log('|-------|----------|-----|----------|-----|-------|--------|');
  for (const r of report) {
    console.log(
      `| ${r.table} | ${r.critical ? '⭐' : ''} | ${r.rlsEnabled ? '✓' : '✗'} | ${r.policies} | ${r.coveredOps} | ${r.coveredRoles} | ${r.status} |`
    );
  }
  console.log('');
}

// Check mode: block on critical tables without RLS
const missing = report.filter(r => r.critical && !r.rlsEnabled);
const rlsNoPolicy = report.filter(r => r.critical && r.rlsEnabled && r.policies === 0);

if (CHECK_MODE) {
  if (missing.length > 0) {
    console.error(`\n❌ RLS audit: ${missing.length} critical table(s) without ENABLE ROW LEVEL SECURITY:\n`);
    for (const r of missing) {
      console.error(`   🔴 zapp.${r.table} — add ALTER TABLE zapp.${r.table} ENABLE ROW LEVEL SECURITY`);
    }
  }
  if (rlsNoPolicy.length > 0) {
    console.error(`\n⚠️  RLS audit: ${rlsNoPolicy.length} critical table(s) have RLS enabled but no policies:\n`);
    for (const r of rlsNoPolicy) {
      console.error(`   ⚠️  zapp.${r.table} (from ${r.rlsSource}) — add at least one CREATE POLICY`);
    }
  }
  if (missing.length > 0) {
    if (ADVISORY_MODE) {
      console.warn(
        `::warning title=RLS audit (E34)::${missing.length}/${CRITICAL_TABLES.size} critical table(s) without ENABLE ROW LEVEL SECURITY evidence in migrations. Advisory até a reconciliação migrations×banco (evidências 008/009); endurecer removendo --advisory do quality-gate.`
      );
    } else {
      console.error('\nAll app tables in the zapp schema require RLS. See docs/SCHEMA_REFERENCE.md.');
      process.exit(1);
    }
  }
  if (rlsNoPolicy.length === 0 && missing.length === 0) {
    const covered = report.filter(r => r.critical && r.rlsEnabled && r.policies > 0).length;
    console.log(`✅ RLS audit: ${covered}/${CRITICAL_TABLES.size} critical tables have RLS + policies. ${rlsNoPolicy.length} advisory gaps.`);
  } else if (ADVISORY_MODE && missing.length > 0) {
    const covered = report.filter(r => r.critical && r.rlsEnabled && r.policies > 0).length;
    console.log(`ℹ️  RLS audit (advisory): ${covered}/${CRITICAL_TABLES.size} critical tables have RLS + policies; ${missing.length} sem evidência em migrations, ${rlsNoPolicy.length} sem policy.`);
  }
}
