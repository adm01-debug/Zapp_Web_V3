#!/usr/bin/env node
/**
 * ETAPA 88 (PLANO-100-CONTRATOS-EDGE, Bloco 8) — Guarda anti-regressão da
 * migração para `invokeEdge`.
 * -----------------------------------------------------------------------------
 * Por que existe:
 *   `src/lib/invokeEdge.ts` (Bloco 7, etapa 75) é o wrapper ÚNICO que lê o
 *   envelope 422 canônico (`{error, code, message, details[]}`) e devolve
 *   `code`/`message`/`fieldErrors` reais do servidor. Todo call-site que chama
 *   `supabase.functions.invoke` DIRETO trata erro sozinho e, em geral,
 *   descarta o corpo da resposta (mensagens 422 viram string genérica).
 *   A migração é gradual (120 call-sites crus em 2026-08-25); este guarda
 *   garante que o número só DIMINUA — novo código usa invokeEdge.
 *
 * Como funciona (ratchet, igual ao check-coverage-ratchet.mjs):
 *   Conta ocorrências de `.functions.invoke(` em src/** (.ts/.tsx), exceto no
 *   próprio src/lib/invokeEdge.ts (o único lugar onde o invoke cru é legítimo
 *   — é o wrapper). Compara contra o TETO abaixo.
 *     atual  > TETO → exit 1 (regressão: novo invoke cru)
 *     atual  < TETO → passa, com lembrete para rebaixar o teto
 *     atual == TETO → passa
 *
 *   O TETO nunca é atualizado automaticamente. Depois de migrar call-sites
 *   (ou refatorar), rode:
 *     node scripts/check-invoke-migration.mjs --atualizar-teto
 *   …confira o valor sugerido e EDITE o const TETO à mão, no mesmo commit da
 *   migração, com mensagem explicando. Ratchet consciente, nunca automático —
 *   auto-atualizar derrotaria o guarda (mesma regra do coverage-ratchet).
 *
 * Limitações documentadas:
 *   - Conta OCORRÊNCIAS da substring, incluindo comentários e testes
 *     (`.ts`/`.tsx`). Conservador de propósito: um comentário citando
 *     `.functions.invoke(` é churn recente e merece o mesmo escrutínio;
 *     falso-positivo aqui custa uma revisão, falso-negativo custa a mensagem
 *     de erro de um usuário.
 *   - Não faz parsing AST: `functions.invoke` rebatizado (ex.: alias via
 *     desestruturação) não é detectado — o grep do repo (decouple-guard,
 *     check-fe-be-sync) cobre esse resto do universo.
 *
 * Uso:
 *   node scripts/check-invoke-migration.mjs               # guarda (CI)
 *   node scripts/check-invoke-migration.mjs --atualizar-teto  # sugere novo teto
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// TETO (ratchet): máximo de call-sites de `.functions.invoke(` FORA do wrapper.
// Medido em 2026-08-25 (branch feat/plano100-fechamento-2026-08-25): 120
// ocorrências em 82 arquivos — inclui 2 invokes quebrados em 2 linhas
// (`supabase.functions\n .invoke(`) que um grep de linha única não vê; a
// contagem deste script é a autoritativa. Só rebaixe (ou, em último caso,
// suba) à mão — via --atualizar-teto — com justificativa no commit.
// ---------------------------------------------------------------------------
const TETO = 120;

const SRC_DIR = 'src';
const WRAPPER = join('src', 'lib', 'invokeEdge.ts'); // único isento: É o wrapper
const INVOKE_RE = /\.functions\s*\.\s*invoke\s*\(/g;
const EXTS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

/** Caminha src/ recursivamente e devolve caminhos .ts/.tsx relativos à raiz. */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(entry.slice(entry.lastIndexOf('.')))) acc.push(full);
  }
  return acc;
}

/** Mede o total de invoke cru (fora do wrapper) e o detalhamento por arquivo. */
function medir() {
  const porArquivo = [];
  for (const file of walk(SRC_DIR)) {
    if (file === WRAPPER) continue;
    const matches = readFileSync(file, 'utf8').match(INVOKE_RE);
    if (matches && matches.length > 0) porArquivo.push({ file, count: matches.length });
  }
  const total = porArquivo.reduce((s, f) => s + f.count, 0);
  porArquivo.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  return { total, porArquivo };
}

const UPDATE = process.argv.includes('--atualizar-teto');
const { total, porArquivo } = medir();

if (UPDATE) {
  console.log('=== --atualizar-teto (sugestão — NÃO edita nada automaticamente) ===\n');
  console.log(`  Contagem atual: ${total} ocorrências em ${porArquivo.length} arquivos`);
  console.log(`  TETO embutido : ${TETO}`);
  console.log(`\n  Para rebaixar o ratchet (recomendado após migrar call-sites):`);
  console.log(`    1. Edite scripts/check-invoke-migration.mjs:`);
  console.log(`         const TETO = ${total};`);
  console.log(`    2. Atualize a linha de medição do comentário acima do const.`);
  console.log(`    3. Commite junto com a migração, justificando no commit.`);
  console.log(`\n  Subir o teto é decisão consciente e revisada em PR — nunca automático.`);
  process.exit(0);
}

console.log(`=== INVOKE MIGRATION GUARD (etapa 88) ===`);
console.log(`  invoke cru  : ${total} ocorrências em ${porArquivo.length} arquivos (teto: ${TETO})`);
console.log(`  isento      : ${relative('.', WRAPPER)} (é o wrapper — único invoke legítimo)`);
console.log(`  top 5 files :`);
for (const { file, count } of porArquivo.slice(0, 5)) {
  console.log(`    ${String(count).padStart(3)}  ${file}`);
}

if (total > TETO) {
  console.error(
    `\n❌ [invoke-migration] REGRESSÃO: ${total} call-sites de supabase.functions.invoke` +
    ` fora do wrapper (teto: ${TETO}, +${total - TETO}).\n` +
    `   Novo código NÃO deve chamar supabase.functions.invoke direto — importe\n` +
    `   invokeEdge de "@/lib/invokeEdge" para ler o envelope 422 canônico\n` +
    `   (code/message/fieldErrors). Se os +${total - TETO} são migração LEGÍTIMA de\n` +
    `   código antigo que você está apenas movendo de arquivo, rode\n` +
    `   node scripts/check-invoke-migration.mjs --atualizar-teto e suba o teto\n` +
    `   NO MESMO COMMIT, com justificativa.`
  );
  process.exit(1);
}

if (total < TETO) {
  console.log(
    `\n✅ [invoke-migration] OK — ${total}/${TETO}. Migrou call-sites? Rebaixe o teto:` +
    ` rode com --atualizar-teto e edite o const no mesmo commit.`
  );
} else {
  console.log(`\n✅ [invoke-migration] OK — ${total}/${TETO} (exatamente no teto).`);
}
