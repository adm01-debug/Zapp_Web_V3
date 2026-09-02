import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(TEST_FILE), '../../..');

function makeFixture(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'supabase', 'migrations'), { recursive: true });
  mkdirSync(join(root, 'scripts', 'decouple', 'snapshots'), { recursive: true });
  return {
    root,
    srcDir: join(root, 'src'),
    migDir: join(root, 'supabase', 'migrations'),
    snapshotFile: join(root, 'scripts', 'decouple', 'snapshots', 'zapp_schema_snapshot.sql'),
    ignoreFile: join(root, '.sync-ignore'),
  };
}

function runChecker(env: Record<string, string>) {
  return spawnSync('bash', ['scripts/check-fe-be-sync.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('check-fe-be-sync.sh', () => {
  it('resolve o repo root sem hardcode de path local absoluto', () => {
    expect(existsSync(join(REPO_ROOT, 'scripts', 'check-fe-be-sync.sh'))).toBe(true);
    expect(runChecker.toString()).not.toContain('/home/');
  });

  it('aceita objetos presentes apenas no snapshot canônico', () => {
    const fx = makeFixture('fe-be-sync-snapshot-');
    try {
      writeFileSync(
        join(fx.srcDir, 'feature.ts'),
        [
          "export async function demo(supabase: any) {",
          "  await supabase.rpc('rpc_schema_tables', { p_schema: 'zapp' });",
          "  return supabase.from('email_revalidation_jobs').select('*');",
          "  await supabase.storage.from('bucket').list();",
          '}',
        ].join('\n'),
        'utf8'
      );
      writeFileSync(
        fx.snapshotFile,
        [
          "CREATE OR REPLACE FUNCTION zapp.rpc_schema_tables(p_schema text DEFAULT 'zapp') RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;",
          'ALTER FUNCTION zapp.rpc_schema_tables(text) OWNER TO postgres;',
          'CREATE TABLE IF NOT EXISTS zapp.email_revalidation_jobs (id uuid primary key);',
        ].join('\n'),
        'utf8'
      );
      writeFileSync(fx.ignoreFile, '__unused_allowlist_entry__\n', 'utf8');

      const result = runChecker({
        SRC_DIR: fx.srcDir,
        MIG_DIRS: fx.migDir,
        SNAPSHOT_FILE: fx.snapshotFile,
        IGNORE_FILE: fx.ignoreFile,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('FE/BE em sincronismo');
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });

  it('continua falhando para órfão real ausente de migrations e snapshot', () => {
    const fx = makeFixture('fe-be-sync-orphan-');
    try {
      writeFileSync(
        join(fx.srcDir, 'feature.ts'),
        [
          "export async function call(supabase: any) {",
          "  await supabase.rpc('ghost_fn');",
          "  await supabase.storage.from('bucket').list();",
          '}',
        ].join('\n'),
        'utf8'
      );
      writeFileSync(
        fx.snapshotFile,
        [
          "CREATE OR REPLACE FUNCTION zapp.rpc_schema_tables(p_schema text DEFAULT 'zapp') RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;",
          'ALTER FUNCTION zapp.rpc_schema_tables(text) OWNER TO postgres;',
          'CREATE TABLE IF NOT EXISTS zapp.fixture_table (id uuid primary key);',
        ].join('\n'),
        'utf8'
      );
      writeFileSync(fx.ignoreFile, '__unused_allowlist_entry__\n', 'utf8');

      const result = runChecker({
        SRC_DIR: fx.srcDir,
        MIG_DIRS: fx.migDir,
        SNAPSHOT_FILE: fx.snapshotFile,
        IGNORE_FILE: fx.ignoreFile,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('ghost_fn');
      expect(result.stderr).toContain('migrations ativas/snapshot');
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });
});
