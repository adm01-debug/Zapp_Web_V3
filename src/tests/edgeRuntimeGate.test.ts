import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const checker = readFileSync(resolve(repoRoot, 'scripts/check-edge-runtime-functions.sh'), 'utf8');
const scriptPath = resolve(repoRoot, 'scripts/check-edge-runtime-functions.sh');

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

const createScenario = (scenario: 'success' | 'boot_error' | 'no_http') => {
  const root = mkdtempSync(resolve(tmpdir(), 'edge-gate-'));
  tempDirs.push(root);
  const functionsDir = resolve(root, 'functions');
  const alphaDir = resolve(functionsDir, 'alpha');
  const binDir = resolve(root, 'bin');
  const stateDir = resolve(root, 'state');
  execFileSync('mkdir', ['-p', alphaDir, binDir, stateDir]);

  writeFileSync(resolve(alphaDir, 'index.ts'), "Deno.serve(() => new Response('ok'));\n", {
    encoding: 'utf8',
    flag: 'wx',
  });
  writeFileSync(
    resolve(binDir, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
state_dir="\${EDGE_TEST_STATE_DIR:?}"
cmd="\${1:?}"
shift || true
ops_file="$state_dir/ops.log"
case "$cmd" in
  run)
    name=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --name) name="$2"; shift 2 ;;
        -p|-v|-e) shift 2 ;;
        -d|--rm) shift ;;
        *) shift ;;
      esac
    done
    cid="cid-\${name:-alpha}"
    printf '%s\\n' "$cid" > "$state_dir/cid"
    printf '%s\\n' "true" > "$state_dir/running"
    printf '%s\\n' "127.0.0.1:41000" > "$state_dir/port"
    case "\${EDGE_TEST_SCENARIO:?}" in
      success|no_http) printf '%s\\n' "Listening on 0.0.0.0:9000" > "$state_dir/logs" ;;
      boot_error) printf '%s\\n' "main worker boot error: parse failed" > "$state_dir/logs" ;;
    esac
    echo "run $cid" >> "$ops_file"
    printf '%s\\n' "$cid"
    ;;
  inspect)
    cid="\${3:?}"
    echo "inspect $cid" >> "$ops_file"
    cat "$state_dir/running"
    ;;
  port)
    cid="\${1:?}"
    echo "port $cid" >> "$ops_file"
    cat "$state_dir/port"
    ;;
  logs)
    cid="\${1:?}"
    echo "logs $cid" >> "$ops_file"
    cat "$state_dir/logs"
    ;;
  rm)
    echo "rm $*" >> "$ops_file"
    printf '%s\\n' "false" > "$state_dir/running"
    ;;
  *)
    echo "unsupported docker command: $cmd" >&2
    exit 1
    ;;
esac
`,
    { encoding: 'utf8', flag: 'wx' }
  );
  writeFileSync(
    resolve(binDir, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
state_dir="\${EDGE_TEST_STATE_DIR:?}"
output=""
headers=""
write_out=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --dump-header) headers="$2"; shift 2 ;;
    --write-out) write_out="$2"; shift 2 ;;
    --max-time) shift 2 ;;
    --silent|--show-error) shift ;;
    http://*|https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
echo "curl $url" >> "$state_dir/ops.log"
case "\${EDGE_TEST_SCENARIO:?}" in
  no_http)
    exit 28
    ;;
  success|boot_error)
    printf 'HTTP/1.1 422 Unprocessable Entity\\r\\ncache-control: no-store\\r\\n\\r\\n' > "$headers"
    printf '{"ok":false}' > "$output"
    printf '%s' "422"
    ;;
esac
`,
    { encoding: 'utf8', flag: 'wx' }
  );
  execFileSync('chmod', ['+x', resolve(binDir, 'docker'), resolve(binDir, 'curl')]);

  return { root, functionsDir, stateDir };
};

const runScenario = (
  scenario: 'success' | 'boot_error' | 'no_http',
  scope: 'root' | 'single' = 'root'
) => {
  const { functionsDir, stateDir } = createScenario(scenario);
  const targetDir = scope === 'single' ? resolve(functionsDir, 'alpha') : functionsDir;
  try {
    const stdout = execFileSync('bash', [scriptPath, targetDir], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        EDGE_DOCKER_BIN: resolve(stateDir, '..', 'bin', 'docker'),
        EDGE_CURL_BIN: resolve(stateDir, '..', 'bin', 'curl'),
        EDGE_BOOT_TIMEOUT_SECONDS: '1',
        EDGE_BOOT_POLL_SECONDS: '0.1',
        EDGE_BOOT_PARALLELISM: '1',
        EDGE_TEST_SCENARIO: scenario,
        EDGE_TEST_STATE_DIR: stateDir,
      },
    });
    return { ok: true as const, stdout, ops: readFileSync(resolve(stateDir, 'ops.log'), 'utf8') };
  } catch (error) {
    const err = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    return {
      ok: false as const,
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? ''),
      ops: readFileSync(resolve(stateDir, 'ops.log'), 'utf8'),
    };
  }
};

describe('production Edge Runtime compatibility gate', () => {
  it('boots every function entrypoint with the exact production runtime', () => {
    expect(workflow).toContain('supabase/edge-runtime:v1.74.0');
    expect(workflow).toContain('scripts/check-edge-runtime-functions.sh');
    expect(workflow).not.toContain('denoland/deno:2.2.8');
    expect(checker).toContain('if [ -f "${functions_mount%/}/index.ts" ]; then');
    expect(checker).toContain('-mindepth 2 -maxdepth 2 -name index.ts');
    expect(checker).toContain('start --main-service "/home/deno/functions/${function_name}"');
    expect(checker).toContain('http://127.0.0.1:${host_port}/functions/v1/${function_name}');
  });

  it('removes runtime containers and temp evidence even after each probe', () => {
    expect(checker).toContain('"$docker_bin" rm -f "$container_id"');
    expect(checker).toContain('rm -f "$body_file" "$headers_file" "$meta_file"');
    expect(checker).toContain('worker boot error|could not be parsed|main worker boot error');
  });

  it('requires positive HTTP proof instead of treating timeout as success', () => {
    expect(checker).not.toContain('timeout --verbose');
    expect(checker).toContain('boot_succeeded=false');
    expect(checker).toContain("printf 'FAIL %s (sem prova HTTP positiva em %ss)");
    expect(checker).toContain("printf 'OK %s (HTTP %s)");
  });

  it('passes only when the fake runtime stays running, maps port 9000 and answers HTTP', () => {
    const result = runScenario('success');

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('OK alpha (HTTP 422)');
    expect(result.stdout).toContain('Todas as 1 Edge Functions responderam HTTP');
    expect(result.ops).toMatch(/run cid-edge-http-local-alpha-[0-9]+/);
    expect(result.ops).toMatch(/port cid-edge-http-local-alpha-[0-9]+/);
    expect(result.ops).toContain('curl http://127.0.0.1:41000/functions/v1/alpha');
    expect(result.ops).toMatch(/rm -f cid-edge-http-local-alpha-[0-9]+/);
  });

  it('also accepts a single function directory as input', () => {
    const result = runScenario('success', 'single');

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('OK alpha (HTTP 422)');
    expect(result.stdout).toContain('Todas as 1 Edge Functions responderam HTTP');
  });

  it('fails even with an HTTP status when boot logs contain a real worker boot error', () => {
    const result = runScenario('boot_error');

    expect(result.ok).toBe(false);
    expect(result.stdout).toContain('FAIL alpha (boot error no runtime)');
    expect(result.stderr).toContain('Edge Functions incompatíveis');
    expect(result.ops).toMatch(/rm -f cid-edge-http-local-alpha-[0-9]+/);
  });

  it('fails when no HTTP response arrives before the deadline', () => {
    const result = runScenario('no_http');

    expect(result.ok).toBe(false);
    expect(result.stdout).toContain('FAIL alpha (sem prova HTTP positiva em 1s)');
    expect(result.stderr).toContain('http-timeout');
    expect(result.ops).toMatch(/rm -f cid-edge-http-local-alpha-[0-9]+/);
  });
});
