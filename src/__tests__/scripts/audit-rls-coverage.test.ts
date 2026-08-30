import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(repoRoot, 'scripts', 'audit-rls-coverage.mjs');

// Extrai a lista crítica do próprio script — se a lista mudar, o teste
// acompanha sem duplicar a fonte de verdade.
const scriptSrc = readFileSync(SCRIPT, 'utf8');
const listMatch = scriptSrc.match(/const CRITICAL_TABLES = new Set\(\[([\s\S]*?)\]\);/);
const criticalTables = listMatch
  ? [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];
// G8-5: views security_invoker críticas (protegidas pelas tabelas base evo.*)
const viewMatch = scriptSrc.match(/const CRITICAL_VIEWS = new Set\(\[([\s\S]*?)\]\);/);
const criticalViews = viewMatch
  ? [...viewMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];

const makeFixture = (sql: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'rls-audit-'));
  const migDir = join(dir, 'supabase', 'migrations');
  mkdirSync(migDir, { recursive: true });
  writeFileSync(join(migDir, '20260101000000_fixture.sql'), sql);
  return dir;
};

const runAudit = (cwd: string, extraArgs: string[] = []) =>
  spawnSync('node', [SCRIPT, '--check', ...extraArgs], { cwd, encoding: 'utf8' });

// Regressão do bug da evidência 008 (14/31 verde): tabelas críticas nunca
// mencionadas nas migrations ficavam fora do relatório e do cálculo de falha.
// Após o fix E34 (2026-08-30), todas as CRITICAL_TABLES são materializadas
// antes do parse e a ausência de evidência derruba o --check.
describe('audit-rls-coverage (E34)', () => {
  it('exposes a non-trivial critical list parsed from the script itself', () => {
    // 28 tabelas físicas + 3 views security_invoker = 31 relações críticas
    // (cross-check DB 2026-08-30, evidência 009).
    expect(criticalTables.length).toBeGreaterThanOrEqual(28);
    expect(criticalViews).toEqual(['contacts', 'conversations', 'messages']);
    expect(criticalTables.length + criticalViews.length).toBeGreaterThanOrEqual(31);
  });

  it('fails closed when critical tables have no migration evidence', () => {
    const fixture = makeFixture(
      'ALTER TABLE zapp.tabela_nao_critica ENABLE ROW LEVEL SECURITY;\n',
    );
    const result = runAudit(fixture);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `${criticalTables.length} critical table(s) without ENABLE ROW LEVEL SECURITY`,
    );
    expect(result.stderr).toContain('zapp.profiles');
  });

  it('passes when every critical table has RLS + policy evidence', () => {
    const sql = criticalTables
      .map(
        (t) =>
          `ALTER TABLE zapp.${t} ENABLE ROW LEVEL SECURITY;\n` +
          `CREATE POLICY ${t}_sel ON zapp.${t} FOR SELECT TO authenticated USING (true);`,
      )
      .join('\n');
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `${criticalTables.length}/${criticalTables.length} critical tables have RLS + policies`,
    );
  });

  it('advisory mode warns without failing (temporary CI posture)', () => {
    const fixture = makeFixture(
      'ALTER TABLE zapp.tabela_nao_critica ENABLE ROW LEVEL SECURITY;\n',
    );
    const result = runAudit(fixture, ['--advisory']);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('::warning title=RLS audit (E34)::');
  });

  it('ignores RLS evidence inside SQL comments (G8-3)', () => {
    // profiles aparece SÓ em comentários (-- e bloco /* */): antes do fix o
    // parser contava comentário como evidência e o gate saía verde.
    const sql = criticalTables
      .map((t) => {
        if (t === 'profiles') {
          return (
            `-- ALTER TABLE zapp.${t} ENABLE ROW LEVEL SECURITY;\n` +
            `/*\nALTER TABLE zapp.${t} ENABLE ROW LEVEL SECURITY;\n*/`
          );
        }
        return (
          `ALTER TABLE zapp.${t} ENABLE ROW LEVEL SECURITY;\n` +
          `CREATE POLICY ${t}_sel ON zapp.${t} FOR SELECT TO authenticated USING (true);`
        );
      })
      .join('\n');
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('1 critical table(s) without');
    expect(result.stderr).toContain('zapp.profiles');
  });

  it('accepts ALTER TABLE ONLY as valid RLS evidence (G8-4)', () => {
    const sql = criticalTables
      .map(
        (t) =>
          `ALTER TABLE ONLY zapp.${t} ENABLE ROW LEVEL SECURITY;\n` +
          `CREATE POLICY ${t}_sel ON zapp.${t} FOR SELECT TO authenticated USING (true);`,
      )
      .join('\n');
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(0);
  });

  it('does not require RLS evidence for security_invoker views (G8-5)', () => {
    // O fixture cobre apenas as tabelas físicas — contacts, conversations e
    // messages ficam sem evidência e o gate deve passar: são views
    // security_invoker protegidas pelas tabelas base evo.* (validação viva
    // em rls-role-matrix.test.ts).
    const sql = criticalTables
      .map(
        (t) =>
          `ALTER TABLE zapp.${t} ENABLE ROW LEVEL SECURITY;\n` +
          `CREATE POLICY ${t}_sel ON zapp.${t} FOR SELECT TO authenticated USING (true);`,
      )
      .join('\n');
    const result = runAudit(makeFixture(sql));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `${criticalTables.length}/${criticalTables.length} critical tables have RLS + policies`,
    );
  });
});
