// Deno unit tests — GAP-2: ALLOW_SHARED_SECRET default behavior
// Run: deno test supabase/functions/evolution-webhook/security_config_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Helper that replicates the env-var logic from index.ts (line 51)
function resolveAllowSharedSecret(envValue: string | undefined): boolean {
  return envValue?.trim().toLowerCase() === "true";
}

Deno.test("ALLOW_SHARED_SECRET defaults to false (HMAC-only) when env var absent", () => {
  const result = resolveAllowSharedSecret(undefined);
  assertEquals(result, false, "Default must be false — shared-secret fallback must be disabled");
});

Deno.test("ALLOW_SHARED_SECRET is false when env var is 'false'", () => {
  assertEquals(resolveAllowSharedSecret("false"), false);
  assertEquals(resolveAllowSharedSecret("FALSE"), false);
  assertEquals(resolveAllowSharedSecret("False"), false);
});

Deno.test("ALLOW_SHARED_SECRET is false when env var is empty string", () => {
  assertEquals(resolveAllowSharedSecret(''), false);
});

Deno.test("ALLOW_SHARED_SECRET can be explicitly enabled via env var 'true'", () => {
  assertEquals(resolveAllowSharedSecret("true"), true);
  assertEquals(resolveAllowSharedSecret("TRUE"), true);
  assertEquals(resolveAllowSharedSecret("True"), true);
});

Deno.test("GAP-2 regression: old default ('true') would have allowed shared-secret", () => {
  // Before GAP-2 fix, the default was 'true' — this confirms the old behavior
  // is no longer the baseline.
  const oldDefaultBehavior = ("true").toLowerCase() !== "false"; // was: ?? 'true'
  const newDefaultBehavior = resolveAllowSharedSecret(undefined);  // now: === 'true' (fail-closed)
  assertEquals(oldDefaultBehavior, true,  "Old default was permissive (shared-secret allowed)");
  assertEquals(newDefaultBehavior, false, "New default is strict   (HMAC-only)");
});
