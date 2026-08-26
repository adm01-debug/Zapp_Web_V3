import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflow = readFileSync(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8");
const checker = readFileSync(
  resolve(repoRoot, "scripts/check-edge-runtime-functions.sh"),
  "utf8",
);

describe("production Edge Runtime compatibility gate", () => {
  it("boots every function entrypoint with the exact production runtime", () => {
    expect(workflow).toContain("supabase/edge-runtime:v1.74.0");
    expect(workflow).toContain("scripts/check-edge-runtime-functions.sh");
    expect(workflow).not.toContain("denoland/deno:2.9.5");
    expect(checker).toContain("-mindepth 2 -maxdepth 2 -name index.ts");
    expect(checker).toContain('start --main-service "/home/deno/functions/${function_name}"');
  });

  it("bounds and removes runtime containers even when shutdown ignores SIGTERM", () => {
    expect(checker).toContain("timeout --verbose --signal=TERM --kill-after=3");
    expect(checker).toContain('docker rm -f "$container_name"');
    expect(checker).toContain("worker boot error|could not be parsed|main worker boot error");
  });

  it("accepts SIGKILL only when timeout records that it sent the signal", () => {
    expect(checker).toContain("timeout_forced_kill=false");
    expect(checker).toContain("timeout: sending signal KILL to command");
    expect(checker).toContain('[ "$status" -eq 137 ] && [ "$timeout_forced_kill" = true ]');
    expect(checker).not.toContain('[ "$elapsed" -ge "$boot_timeout" ]');
  });

  it("inspects boot logs before accepting either timeout exit status", () => {
    expect(checker).toMatch(
      /if \[ "\$status" -eq 124 \][\s\S]*grep -Eq 'worker boot error\|could not be parsed\|main worker boot error'/,
    );
    expect(checker.indexOf("grep -Eq")).toBeLessThan(checker.indexOf("printf 'OK %s"));
  });
});
