#!/usr/bin/env node
/**
 * ETAPA 90 (PLANO-100-CONTRATOS-EDGE, Bloco 8) — Guarda anti-regressão de
 * shapes de erro ad-hoc (`{ error: "..." }`) em Edge Functions.
 * -----------------------------------------------------------------------------
 * Por que existe:
 *   O envelope canônico de erro não-validação é o helper `errorEnvelope()`
 *   (_shared/validation.ts, etapa 26): `{error: true, code, message}` — e o
 *   envelope 422 de contrato (contract-kit.ts) é `{error, code, message,
 *   contract, details[]}`. O antipadrão que este guarda vigia é o objeto de
 *   erro ad-hoc literAL `{ error: "string" }` (status + string solta), que o
 *   frontend não consegue discriminar por `code` — cada endpoint inventa um
 *   shape. A migração para o helper é gradual; este guarda garante que NENHUM
 *   shape ad-hoc NOVO entre — o número só diminui, até `errorEnvelope`
 *   cobrir tudo (decaimento incremental rumo a zero).
 *
 * Como funciona (ratchet, igual ao check-invoke-migration.mjs):
 *   Conta ocorrências da substring LITERAL `{ error: "` em todos os .ts sob
 *   supabase/functions/, EXCLUINDO diretórios _archive e __tests__
 *   (código morto e testes não servem tráfego). Compara contra o TETO abaixo.
 *     atual  > TETO → exit 1 (regressão: novo shape ad-hoc)
 *     atual  < TETO → passa, com lembrete para rebaixar o teto
 *     atual == TETO → passa
 *
 *   O TETO nunca é atualizado automaticamente. Depois de migrar respostas de
 *   erro para `errorEnvelope()` (ou o 422 do contract-kit), rode:
 *     node scripts/check-error-shapes.mjs --atualizar-teto
 *   …confira o valor sugerido e EDITE o const TETO à mão, no mesmo commit da
 *   migração, com mensagem explicando. Ratchet consciente, nunca automático —
 *   auto-atualizar derrotaria o guarda (mesma regra dos demais ratchets).
 *
 * Limitações documentadas:
 *   - Conta OCORRÊNCIAS da substring, incluindo comentários. Conservador de
 *     propósito: um comentário citando o shape é churn recente e merece o
 *     mesmo escrutínio; falso-positivo custa uma revisão, falso-negativo
 *     custa um shape inconsistente indo para produção.
 *   - Metodologia CALIBRADA com o baseline (82): literal exato `{ error: "`
 *     com aspas duplas. Tolerar espaços (`{error:"`) contaria 83; incluir
 *     aspas simples contaria 271 — qualquer mudança aqui precisa de novo
 *     baseline medido à mão, no mesmo commit.
 *   - Não faz parsing AST: alias/rename do shape não é detectado.
 *
 * Uso:
 *   node scripts/check-error-shapes.mjs               # guarda (CI)
 *   node scripts/check-error-shapes.mjs --atualizar-teto  # sugere novo teto
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// TETO (ratchet): máximo de objetos de erro ad-hoc `{ error: "` em produção.
// Baseline medido pela coordenação em 2026-08-25 (branch
// feat/plano100-melhorias-2026-08-25) com esta metodologia exata: 82
// ocorrências fora de _archive/__tests__. Só rebaixe (ou, em último caso,
// suba) à mão — via --atualizar-teto — com justificativa no commit.
// ---------------------------------------------------------------------------
const TETO = 82;

const SRC_DIR = join('supabase', 'functions');
const ANTI_PATTERN_RE = /\{ error: "/g; // literal exato — ver limitações acima
const SKIP_DIRS = new Set(['_archive', '__tests__', 'node_modules', '.git']);

/** Caminha supabase/functions/ recursivamente e devolve caminhos .ts. */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

/** Mede o total de shapes ad-hoc e o detalhamento por arquivo. */
function medir() {
  const porArquivo = [];
  for (const file of walk(SRC_DIR)) {
    const matches = readFileSync(file, 'utf8').match(ANTI_PATTERN_RE);
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
  console.log(`\n  Para rebaixar o ratchet (recomendado após migrar erros p/ errorEnvelope):`);
  console.log(`    1. Edite scripts/check-error-shapes.mjs:`);
  console.log(`         const TETO = ${total};`);
  console.log(`    2. Atualize a linha de medição do comentário acima do const.`);
  console.log(`    3. Commite junto com a migração, justificando no commit.`);
  console.log(`\n  Subir o teto é decisão consciente e revisada em PR — nunca automático.`);
  process.exit(0);
}

console.log(`=== ERROR SHAPES GUARD (etapa 90) ===`);
console.log(`  ad-hoc       : ${total} ocorrências em ${porArquivo.length} arquivos (teto: ${TETO})`);
console.log(`  antipadrão   : { error: "..." } — objeto de erro ad-hoc fora do envelope`);
console.log(`  canônico     : errorEnvelope() (_shared/validation.ts) + 422 do contract-kit`);
console.log(`  excluídos    : _archive/, __tests__/ (não servem tráfego)`);
console.log(`  top 5 files  :`);
for (const { file, count } of porArquivo.slice(0, 5)) {
  console.log(`    ${String(count).padStart(3)}  ${file}`);
}

if (total > TETO) {
  console.error(
    `\n❌ [error-shapes] REGRESSÃO: ${total} objetos de erro ad-hoc \`{ error: "\` em\n` +
    `   supabase/functions (teto: ${TETO}, +${total - TETO}).\n` +
    `   Novo código NÃO deve devolver { error: "string" } — use errorEnvelope()\n` +
    `   de _shared/validation.ts ({error:true, code, message}) ou deixe o gate\n` +
    `   parseOrReject (_shared/contract-kit.ts) emitir o 422 canônico. Se os\n` +
    `   +${total - TETO} são migração LEGÍTIMA de código antigo que você está apenas movendo\n` +
    `   de arquivo, rode node scripts/check-error-shapes.mjs --atualizar-teto e\n` +
    `   suba o teto NO MESMO COMMIT, com justificativa.`
  );
  process.exit(1);
}

if (total < TETO) {
  console.log(
    `\n✅ [error-shapes] OK — ${total}/${TETO}. Migrou erros para errorEnvelope()? Rebaixe o` +
    ` teto: rode com --atualizar-teto e edite o const no mesmo commit.`
  );
} else {
  console.log(`\n✅ [error-shapes] OK — ${total}/${TETO} (exatamente no teto).`);
}
