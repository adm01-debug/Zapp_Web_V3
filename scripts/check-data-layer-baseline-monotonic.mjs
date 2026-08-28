#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BASELINE_PATH = "scripts/data-layer-baseline.json";
export const DATA_LAYER_SCOPES = [
  "src/components",
  "src/pages",
  "src/features",
  "src/hooks",
];
const HARD_SCOPES = new Set(["src/components", "src/pages"]);

export function parseDataLayerBaseline(raw, label) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label}: JSON inválido (${error.message})`);
  }

  const calls = parsed?.calls;
  if (!calls || typeof calls !== "object" || Array.isArray(calls)) {
    throw new Error(`${label}: campo calls inválido`);
  }

  const keys = Object.keys(calls).sort();
  const expected = [...DATA_LAYER_SCOPES].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: escopos devem ser exatamente ${DATA_LAYER_SCOPES.join(", ")}`,
    );
  }

  for (const scope of DATA_LAYER_SCOPES) {
    const value = calls[scope];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label}: contador inválido em ${scope}`);
    }
  }

  return calls;
}

export function assertDataLayerBaselineMonotonic(baseCalls, candidateCalls) {
  const hardIncreases = DATA_LAYER_SCOPES.filter(
    (scope) =>
      HARD_SCOPES.has(scope) && candidateCalls[scope] > baseCalls[scope],
  );
  const baseTotal = DATA_LAYER_SCOPES.reduce(
    (total, scope) => total + baseCalls[scope],
    0,
  );
  const candidateTotal = DATA_LAYER_SCOPES.reduce(
    (total, scope) => total + candidateCalls[scope],
    0,
  );

  if (
    !Number.isSafeInteger(baseTotal) ||
    !Number.isSafeInteger(candidateTotal)
  ) {
    throw new Error("soma dos contadores excede o intervalo inteiro seguro");
  }

  if (hardIncreases.length > 0) {
    throw new Error(
      `baseline afrouxou escopo hard: ${hardIncreases.join(", ")}`,
    );
  }
  if (candidateTotal > baseTotal) {
    throw new Error(
      `baseline afrouxou o teto global: ${baseTotal} -> ${candidateTotal}`,
    );
  }

  return { baseTotal, candidateTotal };
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run() {
  const baseRef = readArgument("--base-ref");
  if (
    !baseRef ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(baseRef) ||
    baseRef.includes("..") ||
    baseRef.includes("//") ||
    baseRef.endsWith("/")
  ) {
    throw new Error("--base-ref ausente ou inválido");
  }

  const baseRaw = execFileSync("git", ["show", `${baseRef}:${BASELINE_PATH}`], {
    encoding: "utf8",
  });
  const candidateRaw = readFileSync(BASELINE_PATH, "utf8");
  const baseCalls = parseDataLayerBaseline(
    baseRaw,
    `baseline base (${baseRef})`,
  );
  const candidateCalls = parseDataLayerBaseline(
    candidateRaw,
    "baseline candidato",
  );
  const { baseTotal, candidateTotal } = assertDataLayerBaselineMonotonic(
    baseCalls,
    candidateCalls,
  );

  console.log(
    `✅ baseline monotônico contra ${baseRef}: ${baseTotal} -> ${candidateTotal}`,
  );
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    run();
  } catch (error) {
    console.error(`❌ data-layer baseline monotonicity: ${error.message}`);
    process.exitCode = 1;
  }
}
