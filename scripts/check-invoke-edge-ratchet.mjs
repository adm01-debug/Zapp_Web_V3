#!/usr/bin/env node
/**
 * ETAPA 91 (PLANO-100-CONTRATOS-EDGE) — Ratchet de `supabase.functions.invoke`.
 *
 * O caminho canônico para chamar Edge Functions no frontend é o wrapper
 * `src/lib/invokeEdge.ts` (tratamento uniforme de erro/timeout/contrato).
 * Chamadas diretas `supabase.functions.invoke(...)` fora dele são dívida:
 * medido em 2026-10-02 = 129 ocorrências. O ratchet congela o número —
 * nenhum PR pode AUMENTAR; quem migrar para invokeEdge baixa o TETO no
 * mesmo commit (ratchet consciente, nunca automático — mesma regra dos
 * demais ratchets do repo).
 *
 * Excluídos da contagem: testes, fixtures, invokeEdge.ts (o próprio wrapper)
 * e comentários (match é textual sobre a linha — falsos positivos em
 * comentário são raros e devem ser ajustados no texto, não no regex).
 *
 * Para rebaixar o teto: ajuste TETO abaixo no mesmo commit da migração.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TETO = 129;
const EXCLUDE = /(__tests__|\.test\.|\.spec\.|\/tests?\/|fixtures|invokeEdge\.ts|edgeFunctions\.ts)/;
const NEEDLE = /functions\.invoke/;

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(e.name)) yield p;
  }
}

// paridade com o grep original: conta LINHAS com ≥1 match
let current = 0;
for (const file of walk("src")) {
  if (EXCLUDE.test(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (NEEDLE.test(line)) current++;
  }
}

console.log(`invoke-edge-ratchet: ${current} chamadas diretas (teto ${TETO})`);

if (current > TETO) {
  console.error(
    `\n❌ +${current - TETO} nova(s) chamada(s) direta(s) de edge function.\n` +
      `Use o wrapper canônico: import { invokeEdge } from "@/lib/invokeEdge"\n` +
      `(trata erro/timeout/envelope de forma uniforme).`,
  );
  process.exit(1);
}
if (current < TETO) {
  console.log(
    `\n✅ ${TETO - current} chamada(s) migrada(s) para invokeEdge! Rebaixe o TETO\n` +
      `em scripts/check-invoke-edge-ratchet.mjs para ${current} no mesmo commit.`,
  );
}
console.log("✅ Ratchet OK — contagem não cresceu.");
