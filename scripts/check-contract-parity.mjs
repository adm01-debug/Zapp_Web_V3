#!/usr/bin/env node
/**
 * ETAPA 80 (PLANO-100-CONTRATOS-EDGE) — Paridade CONTRACTS × CONTRACT_SCHEMAS.
 *
 * Os DOIS registros de contrato devem estar sincronizados (mesma regra da
 * Invariante 8 do contract-registry-integrity.test.ts, aqui executável em
 * Node puro — sem Deno — para rodar como gate de CI):
 *   CONTRACTS (contract-versions.ts): fonte de verdade de versões suportadas.
 *   CONTRACT_SCHEMAS (contract-schemas.ts): schemas zod por versão.
 *
 *   ERRO 1) chave em CONTRACT_SCHEMAS sem entrada em CONTRACTS (fantasma)
 *   ERRO 2) chave em CONTRACTS sem schema (contrato sem validação)
 *   ERRO 3) versão com schema que não consta em `supported` do contrato
 *   ERRO 4) versão em `supported` sem schema correspondente
 *   ERRO 5) `current` fora de `supported`
 *
 * CONTRACT_SCHEMAS não dá para eval (valores referenciam imports zod) —
 * as chaves de primeiro nível são extraídas por scanner de profundidade
 * de `{}`, ignorando strings e comentários.
 */

import { readFileSync } from "node:fs";

const VERSIONS = "supabase/functions/_shared/contract-versions.ts";
const SCHEMAS = "supabase/functions/_shared/contract-schemas.ts";

/** Mapa chave → texto interno do valor {...} de cada entrada de nível 1. */
function entryInners(body) {
  const entries = {};
  let depth = 0, i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let str = ""; i++;
      while (i < body.length && body[i] !== q) { if (body[i] === "\\") { str += body[i + 1]; i += 2; continue; } str += body[i]; i++; }
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
    if (c === "/" && body[i + 1] === "*") { i += 2; while (i < body.length && !(body[i] === "*" && body[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return entries;
}

/** CONTRACTS → { key: { current, supported } } — parser estrutural, sem eval. */
function parseContracts() {
  const src = readFileSync(VERSIONS, "utf8");
  const body = extractObjectBody(src, "CONTRACTS");
  const entries = entryInners(body);
  const out = {};
  for (const [key, inner] of Object.entries(entries)) {
    const current = inner.match(/\bcurrent:\s*"([^"]+)"/)?.[1] ?? null;
    const supSrc = inner.match(/\bsupported:\s*\[([^\]]*)\]/)?.[1] ?? "";
    const supported = [...supSrc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    out[key] = { current, supported };
  }
  return out;
}

/** Extrai o bloco {...} de uma `export const X = {...}` e retorna o body. */
function extractObjectBody(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`${exportName} não encontrado`);
  const braceStart = src.indexOf("{", src.indexOf("=", start));
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(braceStart + 1, i);
}

/** Mapa chave → versões (v1, v2, ...) de cada entrada de nível 1. */
function schemaEntries(body) {
  const entries = {};
  let depth = 0, i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let str = ""; i++;
      while (i < body.length && body[i] !== q) { if (body[i] === "\\") { str += body[i + 1]; i += 2; continue; } str += body[i]; i++; }
      i++;
      if (depth === 0) {
        let j = i; while (body[j] === " " || body[j] === "\t") j++;
        if (body[j] === ":") {
          j++; while (body[j] === " " || body[j] === "\t" || body[j] === "\n") j++;
          // valor pode ser {...} (SchemaMap) — capturar versões
          if (body[j] === "{") {
            let d = 0, k = j;
            for (; k < body.length; k++) {
              if (body[k] === "{") d++;
              else if (body[k] === "}") { d--; if (d === 0) break; }
            }
            const inner = body.slice(j + 1, k);
            const vers = [...inner.matchAll(/\b(v\d+)\s*:/g)].map((m) => m[1]);
            entries[str] = vers;
            i = k + 1;
          } else {
            entries[str] = [];
          }
        }
      }
      continue;
    }
    if (c === "/" && body[i + 1] === "/") { while (i < body.length && body[i] !== "\n") i++; continue; }
    if (c === "/" && body[i + 1] === "*") { i += 2; while (i < body.length && !(body[i] === "*" && body[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return entries;
}

const contracts = parseContracts();
const schemasBody = extractObjectBody(readFileSync(SCHEMAS, "utf8"), "CONTRACT_SCHEMAS");
const schemas = schemaEntries(schemasBody);
const errors = [];
const contractKeys = new Set(Object.keys(contracts));
const schemaKeys = new Set(Object.keys(schemas));

for (const k of schemaKeys) {
  if (!contractKeys.has(k)) errors.push(`| \`${k}\` | schema sem contrato em CONTRACTS (fantasma — invariante 1b) |`);
}
for (const k of contractKeys) {
  if (!schemaKeys.has(k)) errors.push(`| \`${k}\` | contrato em CONTRACTS sem schema (contrato sem validação) |`);
}
for (const [k, spec] of Object.entries(contracts)) {
  if (!(spec.supported ?? []).includes(spec.current)) {
    errors.push(`| \`${k}\` | \`current=${spec.current}\` fora de \`supported\` |`);
  }
  for (const v of spec.supported ?? []) {
    if (schemas[k] && !schemas[k].includes(v)) {
      errors.push(`| \`${k}\` | versão \`${v}\` em \`supported\` sem schema |`);
    }
  }
}
for (const [k, vers] of Object.entries(schemas)) {
  for (const v of vers) {
    if (contracts[k] && !(contracts[k].supported ?? []).includes(v)) {
      errors.push(`| \`${k}\` | schema \`${v}\` fora de \`supported\` |`);
    }
  }
}

if (errors.length) {
  console.log("\n### check-contract-parity — divergências\n");
  console.log("| Contrato | Problema |");
  console.log("|---|---|");
  for (const e of errors) console.log(e);
  console.log(`\n❌ ${errors.length} divergência(s) — sincronize CONTRACTS e CONTRACT_SCHEMAS.`);
  process.exit(1);
}
console.log(`check-contract-parity: ${contractKeys.size} contratos em paridade com ${schemaKeys.size} schemas. ✅`);
