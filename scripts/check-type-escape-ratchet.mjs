#!/usr/bin/env node
/**
 * type-escape-ratchet — impede o crescimento de `as unknown as`.
 *
 * Medido em 2026-10-02: 197 ocorrências fora de testes — volume grande
 * demais para corrigir em lote sem risco de regressão. O ratchet congela
 * o número: nenhum PR pode AUMENTAR a contagem (remover é bem-vindo e
 * deve baixar a baseline no mesmo commit).
 *
 * Uso:
 *   node scripts/check-type-escape-ratchet.mjs          → compara com a baseline
 *   node scripts/check-type-escape-ratchet.mjs --count  → só imprime a contagem
 *
 * Arquivos excluídos: testes, fixtures, scripts de ferramenta.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const BASELINE_FILE = "scripts/type-escape-baseline.txt";
const EXCLUDE = /(__tests__|\.test\.|\.spec\.|\/tests?\/|fixtures|\.d\.ts$)/;

const out = execSync(
  'grep -rn "as unknown as" src/ supabase/functions/ --include="*.ts" --include="*.tsx" || true',
  { encoding: "utf8" },
);
const current = out.split("\n").filter((l) => l.trim() && !EXCLUDE.test(l)).length;

if (process.argv.includes("--count")) {
  console.log(current);
  process.exit(0);
}

const baseline = parseInt(readFileSync(BASELINE_FILE, "utf8").trim(), 10);
if (!Number.isFinite(baseline)) {
  console.error(`Baseline inválida em ${BASELINE_FILE}`);
  process.exit(2);
}

console.log(`type-escape-ratchet: ${current} ocorrências (baseline ${baseline})`);

if (current > baseline) {
  console.error(
    `\n❌ +${current - baseline} novo(s) \`as unknown as\` — o ratchet proíbe crescer.\n` +
      `Prefira: (1) tipar a resposta com generics do client, (2) zod/validator, ou\n` +
      `(3) um cast único para o tipo real (\`as Foo\`), nunca a ponte \`as unknown as\`.\n` +
      `Lista completa: grep -rn "as unknown as" src/ supabase/functions/`,
  );
  process.exit(1);
}
if (current < baseline) {
  console.log(
    `\n✅ ${baseline - current} cast(s) eliminado(s)! Atualize a baseline:\n` +
      `   echo ${current} > ${BASELINE_FILE}\n` +
      `e commite junto com este PR.`,
  );
}
console.log("✅ Ratchet OK — contagem não cresceu.");
