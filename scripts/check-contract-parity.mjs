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
import { extractObjectBody, entryInners, parseContractsBody } from "./lib/contract-scanner.mjs";

const VERSIONS = "supabase/functions/_shared/contract-versions.ts";
const SCHEMAS = "supabase/functions/_shared/contract-schemas.ts";

const contracts = parseContractsBody(
  extractObjectBody(readFileSync(VERSIONS, "utf8"), "CONTRACTS"),
);
// Mapa chave → versões (v1, v2, ...) via scanner compartilhado
const schemas = entryInners(
  extractObjectBody(readFileSync(SCHEMAS, "utf8"), "CONTRACT_SCHEMAS"),
  (inner) => (inner ? [...inner.matchAll(/\b(v\d+)\s*:/g)].map((m) => m[1]) : []),
);
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
