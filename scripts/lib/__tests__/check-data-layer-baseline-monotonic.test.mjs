import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDataLayerBaselineMonotonic,
  parseDataLayerBaseline,
} from "../../check-data-layer-baseline-monotonic.mjs";

const calls = (overrides = {}) => ({
  "src/components": 0,
  "src/pages": 0,
  "src/features": 296,
  "src/hooks": 370,
  ...overrides,
});

test("accepts an unchanged or tighter baseline", () => {
  assert.deepEqual(assertDataLayerBaselineMonotonic(calls(), calls()), {
    baseTotal: 666,
    candidateTotal: 666,
  });
  assert.deepEqual(
    assertDataLayerBaselineMonotonic(calls(), calls({ "src/features": 295 })),
    { baseTotal: 666, candidateTotal: 665 },
  );
});

test("allows soft-scope redistribution without global growth", () => {
  const base = calls({ "src/features": 200, "src/hooks": 300 });
  const candidate = calls({ "src/features": 201, "src/hooks": 299 });
  assert.deepEqual(assertDataLayerBaselineMonotonic(base, candidate), {
    baseTotal: 500,
    candidateTotal: 500,
  });
});

test("rejects a hard-scope increase even when the global total falls", () => {
  const base = calls({
    "src/components": 1,
    "src/features": 200,
    "src/hooks": 300,
  });
  const candidate = calls({
    "src/components": 2,
    "src/features": 190,
    "src/hooks": 300,
  });
  assert.throws(
    () => assertDataLayerBaselineMonotonic(base, candidate),
    /baseline afrouxou escopo hard: src\/components/,
  );
});

test("rejects a stale candidate after main has a tighter total", () => {
  const tighterMain = calls({ "src/features": 295 });
  const staleCandidate = calls({ "src/features": 296 });
  assert.throws(
    () => assertDataLayerBaselineMonotonic(tighterMain, staleCandidate),
    /baseline afrouxou o teto global: 665 -> 666/,
  );
});

test("rejects totals outside the safe integer range", () => {
  const unsafe = calls({
    "src/features": Number.MAX_SAFE_INTEGER,
    "src/hooks": Number.MAX_SAFE_INTEGER,
  });
  assert.throws(
    () => assertDataLayerBaselineMonotonic(unsafe, unsafe),
    /soma dos contadores excede o intervalo inteiro seguro/,
  );
});

test("rejects malformed, missing, extra, negative, and fractional counters", () => {
  assert.throws(() => parseDataLayerBaseline("{", "bad"), /JSON inválido/);
  assert.throws(
    () => parseDataLayerBaseline("{}", "bad"),
    /campo calls inválido/,
  );
  assert.throws(
    () =>
      parseDataLayerBaseline(
        JSON.stringify({ calls: { ...calls(), extra: 0 } }),
        "bad",
      ),
    /escopos devem ser exatamente/,
  );
  assert.throws(
    () =>
      parseDataLayerBaseline(
        JSON.stringify({ calls: calls({ "src/hooks": -1 }) }),
        "bad",
      ),
    /contador inválido em src\/hooks/,
  );
  assert.throws(
    () =>
      parseDataLayerBaseline(
        JSON.stringify({ calls: calls({ "src/hooks": 1.5 }) }),
        "bad",
      ),
    /contador inválido em src\/hooks/,
  );
});
