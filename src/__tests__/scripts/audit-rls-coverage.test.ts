import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(repoRoot, 'scripts', 'audit-rls-coverage.mjs');
const scriptSrc = readFileSync(SCRIPT, 'utf8');

const listMatch = scriptSrc.match(/const CRITICAL_TABLES = new Set\(\[([\s\S]*?)\]\);/);
const criticalTables = listMatch
  ? [...listMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  : [];
const mapMatch = scriptSrc.match(/const CRITICAL_VIEW_BASES = new Map\(\[([\s\S]*?)\]\);/);
const criticalViewBases = mapMatch
  ? [...mapMatch[1].matchAll(/\['([^']+)', '([^']+)'\]/g)].map((match) => [match[1], match[2]] as const)
  : [];

type CatalogRelation = {
  schema: string;
  name: string;
  exists: boolean;
  rls_enabled?: boolean;
  policies?: string[];
  security_invoker?: boolean;
  base_relation?: string;
};

const makeCatalog = (watermark = '20260101000000') => ({
  catalog_version: 1,
  generated_at: '2026-08-31T00:00:00Z',
  source: 'test-fixture',
  migration_watermark: watermark,
  baseline_migrations_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  relations: [
    ...criticalTables.map<CatalogRelation>((name) => ({
      schema: 'zapp',
      name,
      exists: true,
      rls_enabled: true,
      policies: [`${name} final policy`],
    })),
    ...criticalViewBases.flatMap<CatalogRelation>(([view, base]) => {
      const [schema, name] = base.split('.');
      return [
        {
          schema: 'zapp',
          name: view,
          exists: true,
          security_invoker: true,
          base_relation: base,
        },
        {
          schema,
          name,
          exists: true,
          rls_enabled: true,
          policies: [`${name} final policy`],
        },
      ];
    }),
  ],
});

const makeFixture = (
  sql: string,
  options: { migrationVersion?: string; catalog?: ReturnType<typeof makeCatalog> } = {},
): string => {
  const dir = mkdtempSync(join(tmpdir(), 'rls-audit-'));
  const migrationDir = join(dir, 'supabase', 'migrations');
  mkdirSync(migrationDir, { recursive: true });
  writeFileSync(
    join(migrationDir, `${options.migrationVersion ?? '20260101000000'}_fixture.sql`),
    sql,
  );
  if (options.catalog) {
    writeFileSync(
      join(dir, 'supabase', 'rls-catalog.json'),
      `${JSON.stringify(options.catalog, null, 2)}\n`,
    );
  }
  return dir;
};

const runAudit = (cwd: string, extraArgs: string[] = []) =>
  spawnSync('node', [SCRIPT, '--check', ...extraArgs], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  });

const physicalSql = (withoutPolicy?: string, quotedPolicy = false) =>
  criticalTables
    .map((table) => {
      const rls = `ALTER TABLE zapp.${table} ENABLE ROW LEVEL SECURITY;`;
      if (table === withoutPolicy) return rls;
      const policyName = quotedPolicy ? `"${table} policy with spaces"` : `${table}_select`;
      return `${rls}\nCREATE POLICY ${policyName} ON zapp.${table} FOR SELECT TO authenticated USING (true);`;
    })
    .join('\n');

const basesSql = (withoutRls?: string) =>
  criticalViewBases
    .map(([, base]) => {
      const rls = base === withoutRls ? '' : `ALTER TABLE ${base} ENABLE ROW LEVEL SECURITY;\n`;
      return `${rls}CREATE POLICY "${base} protected policy" ON ${base} FOR SELECT TO authenticated USING (true);`;
    })
    .join('\n');

const viewsSql = (withoutSecurityInvoker?: string) =>
  criticalViewBases
    .map(([view]) => {
      const option = view === withoutSecurityInvoker ? '' : " WITH (security_invoker='on')";
      return `CREATE OR REPLACE VIEW zapp.${view}${option} AS SELECT 1 AS id;`;
    })
    .join('\n');

const secureSql = () => `${physicalSql()}\n${basesSql()}\n${viewsSql()}`;

describe('audit-rls-coverage (E34)', () => {
  it('tracks the exact 25 tables, 6 views, and 6 mapped bases', () => {
    expect(criticalTables).toHaveLength(25);
    expect(criticalViewBases).toEqual([
      ['contacts', 'evo.evolution_contacts'],
      ['conversations', 'evo.evolution_conversations'],
      ['messages', 'evo.evolution_messages'],
      ['email_accounts', 'email_app.email_accounts'],
      ['email_threads', 'email_app.email_threads'],
      ['payment_links', 'financeiro.payment_links'],
    ]);
  });

  it('fails closed when critical relations have no evidence', () => {
    const result = runAudit(makeFixture('SELECT 1;'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('critical relation(s) without RLS');
    expect(result.stderr).toContain('zapp.profiles');
    expect(result.stderr).toContain('critical view(s) missing security_invoker');
  });

  it('passes when every table/base has RLS+policy and every view is security_invoker', () => {
    const result = runAudit(makeFixture(secureSql()));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '25/25 zapp tables, 6/6 view bases, and 6/6 security_invoker views protected',
    );
  });

  it('fails closed when a critical zapp table has RLS but no policy', () => {
    const sql = `${physicalSql('profiles')}\n${basesSql()}\n${viewsSql()}`;
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('critical relation(s) have RLS but no policy');
    expect(result.stderr).toContain('zapp.profiles');
  });

  it('accepts PostgreSQL quoted policy identifiers containing spaces', () => {
    const sql = `${physicalSql(undefined, true)}\n${basesSql()}\n${viewsSql()}`;
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(0);
  });

  it('fails closed when a critical view omits security_invoker', () => {
    const sql = `${physicalSql()}\n${basesSql()}\n${viewsSql('contacts')}`;
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('1 critical view(s) missing security_invoker');
    expect(result.stderr).toContain('zapp.contacts');
  });

  it('fails closed when a mapped base relation has no RLS', () => {
    const sql = `${physicalSql()}\n${basesSql('email_app.email_accounts')}\n${viewsSql()}`;
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('email_app.email_accounts');
  });

  it('replays DROP POLICY after the canonical watermark', () => {
    const catalog = makeCatalog();
    const sql = 'DROP POLICY "app_notifications final policy" ON zapp.app_notifications;';
    const result = runAudit(makeFixture(sql, {
      catalog,
      migrationVersion: '20260101000001',
    }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('zapp.app_notifications');
    expect(result.stderr).toContain('RLS but no policy');
  });

  it('replays DISABLE ROW LEVEL SECURITY after the canonical watermark', () => {
    const result = runAudit(makeFixture(
      'ALTER TABLE evo.evolution_contacts DISABLE ROW LEVEL SECURITY;',
      { catalog: makeCatalog(), migrationVersion: '20260101000001' },
    ));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('evo.evolution_contacts');
  });

  it('fails when a migration at or below the canonical watermark changes', () => {
    const result = runAudit(makeFixture('SELECT 1;', { catalog: makeCatalog() }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Canonical RLS catalog baseline diverged');
  });

  it('ignores RLS evidence inside SQL comments', () => {
    const sql = `${physicalSql('profiles')}\n${basesSql()}\n${viewsSql()}\n` +
      '-- ALTER TABLE zapp.profiles ENABLE ROW LEVEL SECURITY;\n' +
      '/* CREATE POLICY fake ON zapp.profiles USING (true); */';
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('zapp.profiles');
  });

  it('accepts ALTER TABLE ONLY as valid RLS evidence', () => {
    const sql = secureSql().split('ALTER TABLE ').join('ALTER TABLE ONLY ');
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(0);
  });

  it('advisory mode reports all gap classes without failing', () => {
    const result = runAudit(makeFixture('SELECT 1;'), ['--advisory']);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('::warning title=RLS audit (E34)::');
  });

  it('passes strictly against the canonical repository catalog', () => {
    const result = runAudit(repoRoot, ['--require-canonical']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '25/25 zapp tables, 6/6 view bases, and 6/6 security_invoker views protected',
    );
  });
});
