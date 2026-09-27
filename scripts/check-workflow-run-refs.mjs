#!/usr/bin/env node
/**
 * check-workflow-run-refs.mjs (Etapa 82 do plano de CI)
 *
 * Garante que todo `workflow_run.workflows:` referencia um `name:` real de outro
 * workflow no repo. Um nome errado (ex.: falta de emoji, typo) cria um trigger morto
 * que nunca dispara — silenciosamente (achado A4/B2 da auditoria 2026-09-27).
 *
 * Uso: node scripts/check-workflow-run-refs.mjs
 * Exit 0 = OK | Exit 1 = referência quebrada encontrada
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKFLOWS_DIR = resolve('.github/workflows');

const files = readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

/** Extrai o valor do campo `name:` no topo do arquivo (primeira ocorrência sem indent). */
function extractWorkflowName(content) {
  const m = content.match(/^name:\s*(.+)\s*$/m);
  if (!m) return null;
  return m[1].replace(/^['"]|['"]$/g, '').trim();
}

/**
 * Extrai os itens de `workflow_run > workflows:` de forma robusta.
 * Suporta lista YAML [ "a", "b" ] inline e lista em bloco (- "a").
 */
function extractWorkflowRunRefs(content) {
  const refs = [];

  // Encontra o bloco `workflow_run:` dentro de `on:`.
  // Procura por "workflow_run:" seguido de (com indent) "workflows:".
  const wrMatch = content.match(/^\s{2}workflow_run\s*:/m);
  if (!wrMatch) return refs;

  const startIdx = wrMatch.index;
  // Pega as linhas a partir de `workflow_run:` até o próximo key irmão (mesmo nível de indent = 2).
  const afterWr = content.slice(startIdx);
  const lines = afterWr.split('\n');
  let inWorkflowsKey = false;

  for (const line of lines.slice(1)) { // pula a linha `  workflow_run:`
    // Se voltarmos ao nível de indent do `on:` (2 espaços, mesmo nível de `workflow_run`),
    // chegamos ao próximo trigger (ex.: `  schedule:`) — parar.
    if (/^\s{2}\w/.test(line)) break;

    // Linha `    workflows:` (indent 4)
    if (/^\s{4}workflows\s*:/.test(line)) {
      inWorkflowsKey = true;
      // Lista inline: workflows: ["A", "B"]
      const inlineArr = line.match(/\[([^\]]+)\]/);
      if (inlineArr) {
        for (const item of inlineArr[1].matchAll(/["']([^"']+)["']/g)) {
          refs.push(item[1].trim());
        }
        inWorkflowsKey = false; // inline termina aqui
      }
      continue;
    }

    if (inWorkflowsKey) {
      // Lista em bloco: `      - "Nome"` (indent 6)
      if (/^\s{6}-/.test(line)) {
        const itemMatch = line.match(/^\s{6}-\s+["']?(.+?)["']?\s*$/);
        if (itemMatch) refs.push(itemMatch[1].trim());
      } else if (line.trim() && !/^\s{6}/.test(line)) {
        // Saiu do escopo da lista
        inWorkflowsKey = false;
      }
    }
  }

  return refs;
}

// --- Passo 1: coletar todos os names ---
const names = new Set();
const nameMap = {};

for (const f of files) {
  const content = readFileSync(join(WORKFLOWS_DIR, f), 'utf8');
  const name = extractWorkflowName(content);
  if (name) {
    names.add(name);
    nameMap[name] = f;
  }
}

// --- Passo 2: verificar referências ---
let errors = 0;

for (const f of files) {
  const content = readFileSync(join(WORKFLOWS_DIR, f), 'utf8');
  const refs = extractWorkflowRunRefs(content);
  for (const ref of refs) {
    if (!names.has(ref)) {
      console.error(`::error file=.github/workflows/${f}::workflow_run referencia "${ref}" mas nenhum workflow com esse name: existe.`);
      // Sugestão: names parecidos
      const similar = [...names].filter(n =>
        n.replace(/[^\w]/g, '').toLowerCase().includes(
          ref.replace(/[^\w]/g, '').toLowerCase().slice(0, 10)
        )
      );
      if (similar.length) {
        console.error(`  Sugestão — names parecidos:`);
        for (const s of similar) console.error(`    • "${s}" (${nameMap[s]})`);
      }
      errors++;
    } else {
      console.log(`  ✓ "${ref}" → ${nameMap[ref]}`);
    }
  }
}

if (errors === 0) {
  console.log(`✓ ${files.length} workflows verificados — todas as referências workflow_run são válidas.`);
  process.exit(0);
} else {
  console.error(`\n✗ ${errors} referência(s) workflow_run quebrada(s) — corrigir antes de mergear.`);
  process.exit(1);
}
