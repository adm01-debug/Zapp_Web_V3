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

/** Extrai o conteúdo entre as {} de `export const X = { ... }`. */
function objectBody(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`${exportName} não encontrado`);
  const braceStart = src.indexOf("{", src.indexOf("=", start));
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(braceStart + 1, i);
}

/** Mapa chave → texto interno do valor {...} de cada entrada de nível 1. */
function entryInners(body) {
  const entries = {};
  let depth = 0, i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let str = ""; i++;
      while (i < body.length && body[i] !== q) {
        if (body[i] === "\\") { str += body[i + 1]; i += 2; continue; }
        str += body[i]; i++;
      }
      i++;
      if (depth === 0) {
        let j = i; while (body[j] === " " || body[j] === "\t") j++;
        if (body[j] === ":") {
          j++; while (body[j] === " " || body[j] === "\t" || body[j] === "\n") j++;
          if (body[j] === "{") {
            let d = 0, k = j;
            for (; k < body.length; k++) {
              if (body[k] === "{") d++;
              else if (body[k] === "}") { d--; if (d === 0) break; }
            }
            entries[str] = body.slice(j + 1, k);
            i = k + 1;
          } else {
            entries[str] = "";
          }
        }
      }
      continue;
    }
    if (c === "/" && body[i + 1] === "/") { while (i < body.length && body[i] !== "\n") i++; continue; }
    if (c === "/" && body[i + 1] === "*") {
      i += 2;
      while (i < body.length && !(body[i] === "*" && body[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return entries;
}

function parseContracts(filePath) {
  const src = readFileSync(filePath, "utf8");
  const entries = entryInners(objectBody(src, "CONTRACTS"));
  const out = {};
  for (const [key, inner] of Object.entries(entries)) {
    const current = inner.match(/\bcurrent:\s*"([^"]+)"/)?.[1] ?? null;
    const supSrc = inner.match(/\bsupported:\s*\[([^\]]*)\]/)?.[1] ?? "";
    const supported = [...supSrc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const sunset = {};
    const sunsetSrc = inner.match(/\bsunset:\s*\{([^}]*)\}/)?.[1];
    if (sunsetSrc) {
      for (const m of sunsetSrc.matchAll(/(\w+):\s*"([^"]+)"/g)) sunset[m[1]] = m[2];
    }
    out[key] = { current, supported, sunset };
  }
  return out;
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
