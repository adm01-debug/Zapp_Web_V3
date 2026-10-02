#!/usr/bin/env node
/**
 * api-contract-guard — diff de contratos públicos entre base e head do PR.
 *
 * Complementa contract-registry-integrity.test.ts (invariantes estáticas)
 * com regras de EVOLUÇÃO do registry CONTRACTS (contract-versions.ts):
 *
 *  ERRO   1) chave de contrato removida enquanto supabase/functions/<key>/ existe
 *  ERRO   2) versão removida de `supported` antes da data de `sunset`
 *  ERRO   3) contrato novo registrado sem diretório de edge function
 *  ERRO   4) data de sunset inválida (não-ISO) ou adiantada em relação à base
 *  INFO   5) `current` promovido (visibilidade — breaking para clientes novos)
 *  INFO   6) contrato/versão nova adicionada
 *
 * Uso: node scripts/check-api-contract-guard.mjs <base.ts> <head.ts>
 * Sai 1 com tabela markdown dos problemas; 0 se limpo (ou sem diff).
 */

import { readFileSync, existsSync } from "node:fs";

const [basePath, headPath] = process.argv.slice(2);

function parseContracts(filePath) {
  const src = readFileSync(filePath, "utf8");
  const m = src.match(/export const CONTRACTS[^=]*=\s*(\{[\s\S]*?\n\};)/);
  if (!m) throw new Error(`CONTRACTS não encontrado em ${filePath}`);
  // O literal é objeto JS puro (comentários são válidos); eval local.
  return new Function(`return ${m[1].replace(/;\s*$/, "")}`)();
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const errors = [];
const infos = [];

const base = parseContracts(basePath);
const head = parseContracts(headPath);
const today = new Date().toISOString().slice(0, 10);

const fnExists = (key) =>
  existsSync(`supabase/functions/${key}/index.ts`) ||
  existsSync(`supabase/functions/${key}/mod.ts`);

for (const [key, b] of Object.entries(base)) {
  const h = head[key];
  if (!h) {
    if (fnExists(key)) {
      errors.push(`| \`${key}\` | contrato removido mas \`supabase/functions/${key}/\` ainda existe |`);
    } else {
      infos.push(`| \`${key}\` | contrato removido junto com a function |`);
    }
    continue;
  }
  for (const v of b.supported ?? []) {
    if (!(h.supported ?? []).includes(v)) {
      const sunset = b.sunset?.[v];
      if (sunset && sunset <= today) {
        infos.push(`| \`${key}\` | versão \`${v}\` removida após sunset (${sunset}) |`);
      } else {
        errors.push(`| \`${key}\` | versão \`${v}\` removida de \`supported\` sem sunset vencido (breaking para clientes legados) |`);
      }
    }
  }
  if (b.current !== h.current) {
    infos.push(`| \`${key}\` | \`current\` promovido: ${b.current} → ${h.current} |`);
  }
  for (const [v, date] of Object.entries(h.sunset ?? {})) {
    if (!ISO.test(date)) {
      errors.push(`| \`${key}\` | sunset de \`${v}\` não é ISO YYYY-MM-DD: \`${date}\` |`);
      continue;
    }
    const bDate = b.sunset?.[v];
    if (bDate && ISO.test(bDate) && date < bDate) {
      errors.push(`| \`${key}\` | sunset de \`${v}\` adiantado ${bDate} → ${date} (encurta vida de clientes legados) |`);
    }
  }
}

for (const [key, h] of Object.entries(head)) {
  if (!base[key]) {
    if (fnExists(key)) {
      infos.push(`| \`${key}\` | contrato novo registrado (current=${h.current}) |`);
    } else {
      errors.push(`| \`${key}\` | contrato registrado sem \`supabase/functions/${key}/\` (fantasma — invariante 1b quebra) |`);
    }
    continue;
  }
  for (const v of h.supported ?? []) {
    if (!(base[key].supported ?? []).includes(v)) {
      infos.push(`| \`${key}\` | versão nova \`${v}\` em supported |`);
    }
  }
}

const rows = [...errors, ...infos];
if (!rows.length) {
  console.log("api-contract-guard: CONTRACTS inalterado ou sem violações. ✅");
  process.exit(0);
}

console.log("\n### api-contract-guard\n");
console.log("| Contrato | Mudança |");
console.log("|---|---|");
for (const r of rows) console.log(r);
console.log("");
if (errors.length) {
  console.log(`❌ ${errors.length} violação(ões) de evolução de contrato.`);
  process.exit(1);
}
console.log(`✅ Sem violações (${infos.length} mudança(s) informativa(s)).`);
