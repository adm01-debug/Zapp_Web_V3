#!/usr/bin/env node
/**
 * ETAPA 87/F7 (PLANO-100-CONTRATOS-EDGE, Bloco 8) — Paridade de validadores
 * de campos críticos FRONTEND × BACKEND.
 * -----------------------------------------------------------------------------
 * O que guarda:
 *   O FE valida UX pré-envio em `src/shared/criticalPayloadSchemas.ts`
 *   (zod v4, browser) e o BE enforce o contrato de wire em
 *   `supabase/functions/_shared/contract-schemas.ts` + `_shared/schemas.ts`
 *   (zod 3.23.8, Deno — ver ADR no topo do arquivo FE: são dois propósitos
 *   distintos, não duplicação). Este script garante que, para os TIPOS
 *   críticos compartilhados, os dois lados dão o MESMO veredito
 *   (aceita/rejeita) sobre o mesmo valor — divergência silenciosa é bug de
 *   contrato: o usuário passa na validação de UX e toma 422 do backend
 *   (ou o inverso, UX rejeitando o que o contrato aceita).
 *
 * Como funciona (sem importar Deno/zod no Node):
 *   1. LÊ os arquivos-fonte de ambos os lados como TEXTO.
 *   2. EXTRAÍ as regras (min/max, piso de dígitos, uso de `.uuid()`) por
 *      regex sobre o texto — os próprios validadores já são declarativos.
 *   3. Avalia um CORPUS de casos (telefones/UUIDs válidos e inválidos)
 *      contra os avaliadores reconstruídos de cada lado.
 *   4. FAIL (exit 1) se os vereditos divergirem entre os lados.
 *      FAIL (exit 1) também se a extração falhar — fail-closed: parser
 *      desatualizado NÃO pode passar cego depois de um refactor nos
 *      schemas (a mensagem diz exatamente o que atualizar aqui).
 *
 * Limitações documentadas (honestidade > cobertura frágil):
 *   - TELEFONE: o par comparado é FE `normalizedPhoneSchema` × BE
 *     `phoneOnlyField` (ambos "min 6, max 30, ≥10 dígitos, sem JID"). O BE
 *     tem um 2º helper, `phoneOrJidField`, que ACEITA JIDs (`...@...`) por
 *     design (campos que recebem telefone OU JID do WhatsApp — o `@` nunca
 *     é aceito pelo lado FE). Essa divergência é INTENCIONAL e documentada
 *     no próprio schemas.ts; aparece aqui como NOTA, não como falha.
 *   - O `.transform(strip \D)` do FE e o `.trim()` do BE não alteram
 *     vereditos aceita/rejeita (só o valor pós-validação) — ficam fora da
 *     comparação.
 *   - UUID: ambos os lados usam `z.string().uuid()` do zod (FE v4.x,
 *     BE 3.23.8 — majors diferentes, mas `.uuid()` sem `version:` aceita o
 *     mesmo conjunto nas duas). A avaliação usa a regex canônica comum
 *     `^[0-9a-f]{8}-…-[0-9a-f]{12}$` (case-insensitive). Se um lado
 *     trocar `.uuid()` por regex manual, o parser extrai a regex literal do
 *     fonte e compara veredito a veredito; se não achar nada, fail-closed.
 *   - EMAIL: o BE valida via `EmailAddr` (`.trim().email().max(320)`) mas
 *     o FE NÃO tem validador de email em criticalPayloadSchemas.ts →
 *     WARN "tipo ausente em um dos lados" (regra do PLANO-100), sem
 *     comparação — reproduzir a regex de email do zod de memória seria
 *     exatamente o tipo de frágil que este script se recusa a ser.
 *
 * Uso: node scripts/check-contract-sync.mjs
 */

import { readFileSync } from 'node:fs';

const FE_SCHEMAS = 'src/shared/criticalPayloadSchemas.ts';
const BE_CONTRACT = 'supabase/functions/_shared/contract-schemas.ts';
const BE_HELPERS = 'supabase/functions/_shared/schemas.ts';
const PKG = 'package.json';

// ---------------------------------------------------------------------------
// Leitura + extração de regras (fail-closed: extração quebrada = falha)
// ---------------------------------------------------------------------------

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`❌ [contract-sync] não consegui ler ${path} (rode da raiz do repo)`);
    process.exit(1);
  }
}

/**
 * Extrai as regras de um validador de telefone de um bloco de texto.
 * Duas estruturas aceitas (FE e BE são deliberadamente espelhados no
 * COMPORTAMENTO, não na sintaxe):
 *   FE: z.string().min(6).max(30).transform(strip \D).refine(digits.length >= 10)
 *   BE: const { min = 6, max = 30 } = opts; z.string().min(min).max(max)
 *       .refine(value => value.replace(/\D/g, '').length >= 10)
 * `acceptsJid` = true quando o refine aceita JID (padrão `includes('@') ||`).
 */
function extractPhoneRules(blockName, src, label) {
  const fail = (why) => {
    console.error(
      `❌ [contract-sync] extração de telefone FALHOU em ${label} (bloco "${blockName}"): ${why}.\n` +
      `   Refactor no schema? Atualize o parser aqui em scripts/check-contract-sync.mjs — fail-closed, não passa cego.`
    );
    process.exit(1);
  };

  const start = src.indexOf(blockName);
  if (start === -1) fail('bloco não encontrado no arquivo');
  // Janela generosa após o início do bloco (os arquivos são pequenos e estáveis)
  const window = src.slice(start, start + 900);

  // min/max — duas formas:
  //   FE: literais nas chamadas (`.min(6`, `.max(30)`)
  //   BE: chamadas parametrizadas (`.min(min`, `.max(max)`) com defaults no
  //       destructuring `const { min = 6, max = 30 } = opts`.
  // Quando o bloco é parametrizado, os defaults do destructuring são a fonte
  // correta — um literal `.max(N)` achado na janela pertence a OUTRO schema
  // vizinho (ex.: ClassifyEmojiSchema usa .max(255)) e NUNCA deve vencer.
  const defaults = window.match(/const\s*\{\s*min\s*=\s*(\d+)\s*,\s*max\s*=\s*(\d+)\s*\}\s*=\s*opts/);
  const parametrizado = /\.min\(\s*min[\s,)]/.test(window) && /\.max\(\s*max[\s,)]/.test(window);
  let min = null;
  let max = null;
  if (parametrizado) {
    if (!defaults) fail('bloco parametrizado (.min(min/.max(max)) sem defaults de opts');
    min = Number(defaults[1]);
    max = Number(defaults[2]);
  } else {
    const minLit = window.match(/\.min\(\s*(\d+)/);
    const maxLit = window.match(/\.max\(\s*(\d+)/);
    min = minLit ? Number(minLit[1]) : null;
    max = maxLit ? Number(maxLit[1]) : null;
  }

  // piso de dígitos: FE escreve `digits.length >= N`; BE escreve
  // `value.replace(/\D/g, '').length >= N` — mesma semântica.
  const digits = window.match(
    /(?:digits|value\s*\.\s*replace\(\s*\/\\D\/[gimsuy]*\s*,\s*['"]{2}\s*\))\s*\.\s*length\s*>=\s*(\d+)/
  );
  const stripNonDigits = /replace\(\s*\/\\D\/[gimsuy]*\s*,\s*['"]['"]\s*\)/.test(window);
  const acceptsJid = /includes\(\s*['"]@['"]\s*\)\s*\|\|/.test(window);

  if (min === null || max === null || !digits) fail('não achou .min()/.max()/piso de dígitos');
  if (!stripNonDigits) fail('não achou o strip de não-dígitos replace(/\\D/g, "")');

  return {
    label,
    min,
    max,
    digitsMin: Number(digits[1]),
    acceptsJid,
  };
}

/** Reconstrói o predicado de veredito a partir das regras extraídas. */
function phoneVerdict(rules) {
  const digits = (v) => (typeof v === 'string' ? v.replace(/\D/g, '').length : 0);
  return (v) => {
    if (typeof v !== 'string') return false;
    if (v.length < rules.min || v.length > rules.max) return false;
    if (rules.acceptsJid && v.includes('@')) return true;
    return digits(v) >= rules.digitsMin;
  };
}

/** UUID: detecta uso de `.uuid()` do zod; se não, extrai regex literal manual. */
function extractUuidRules(src, label) {
  if (/\.uuid\(\s*(\{|['"]|\/)/.test(src) || /\.uuid\(\s*\)/.test(src)) {
    // `.uuid()` do zod — regex canônica comum a zod 3.x e 4.x (sem `version:`):
    // 8-4-4-4-12 hex, case-insensitive. (`\b` do fonte zod 3 entre hex e hífen
    // é sempre verdadeiro — hex é \w, hífen não — logo equivalente.)
    return {
      label,
      kind: 'zod-uuid',
      regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    };
  }
  // Regex manual (ex.: histórico "uuid-like" em comentários do contract-schemas)
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/uuid/i.test(lines[i])) continue;
    const m = lines[i].match(/\/(\^[^\n]*?)\/([a-z]*)\s*[,);]/);
    if (m) {
      try {
        return { label, kind: 'regex-manual', regex: new RegExp(m[1], m[2]) };
      } catch {
        /* regex inválida — continua procurando */
      }
    }
  }
  return null; // chamador decide fail-closed
}

// ---------------------------------------------------------------------------
// Corpus (~20 casos por tipo, com casos do enunciado da etapa 87)
// ---------------------------------------------------------------------------

const PHONE_CASES = [
  // desc, valor
  ['válido canônico com +', '+5511999999999'],
  ['válido sem +', '5511999999999'],
  ['válido sem DDI (10 dígitos)', '11999999999'],
  ['válido com pontuação', '+55 (11) 99999-9999'],
  ['válido internacional', '+15550101234'],
  ['válido exatamente no piso (10 dígitos, 10 chars)', '1199999999'],
  ['válido longo formatado (29 chars)', '+5511' + '9'.repeat(24)],
  ['inválido: só letras', 'abc'],
  ['inválido: curto demais', '123'],
  ['inválido: 6 chars mas só 6 dígitos', '123456'],
  ['inválido: 9 dígitos (um a menos que o piso)', '119999999'],
  ['inválido: 9 dígitos com pontuação', '(11) 99999-99'],
  ['ambíguo: 12 dígitos + letra (≥10 dígitos passam)', '551199999999a'],
  ['ambíguo: letra no meio, 13 dígitos', '5511a9999999999'],
  ['inválido: vazio', ''],
  ['inválido: só pontuação/espaços', '  -  '],
  ['inválido: não-string (número)', 5511999999999],
  ['inválido: não-string (null)', null],
  ['válido: DDI de 3 dígitos', '+5511999999999'],
  ['inválido: 31 chars (estoura max 30)', '+5511' + '9'.repeat(26)],
  ['válido: espaços nas bordas, 14 dígitos (21 chars)', ' +55 11 99999 9999 9 '],
  ['inválido: e-mail no campo telefone', 'foo@bar.com'],
];

const UUID_CASES = [
  ['válido v4 canônico', '550e8400-e29b-41d4-a716-446655440000'],
  ['válido nil (all zeros)', '00000000-0000-0000-0000-000000000000'],
  ['válido v1-like', 'a3bb189e-8bf9-1888-9912-ace4e6543002'],
  ['válido v3-like', 'a3bb189e-8bf9-3888-9912-ace4e6543002'],
  ['válido v5-like', 'a3bb189e-8bf9-5888-9912-ace4e6543002'],
  ['válido MAIÚSCULO', '550E8400-E29B-41D4-A716-446655440000'],
  ['válido v7-like', '018c9365-e3bb-7b3a-9f0d-3f4f0f6b1d2a'],
  ['inválido: curto', '123'],
  ['inválido: texto', 'abc'],
  ['inválido: vazio', ''],
  ['inválido: sem hífens', '550e8400e29b41d4a716446655440000'],
  ['inválido: com chaves', '{550e8400-e29b-41d4-a716-446655440000}'],
  ['inválido: urn:uuid: prefix', 'urn:uuid:550e8400-e29b-41d4-a716-446655440000'],
  ['inválido: truncado', '550e8400-e29b-41d4-a716'],
  ['inválido: grupo extra no fim', '550e8400-e29b-41d4-a716-446655440000-extra'],
  ['inválido: 11 hex no último grupo', '550e8400-e29b-41d4-a716-44665544000'],
  ['inválido: 13 hex no último grupo', '550e8400-e29b-41d4-a716-4466554400003'],
  ['inválido: caractere não-hex (g)', '550e8400-e29b-41d4-a716-44665544000g'],
  ['inválido: separador errado (_)', '550e8400_e29b_41d4_a716_446655440000'],
  ['inválido: com quebra de linha no fim', '550e8400-e29b-41d4-a716-446655440000\n'],
  ['inválido: com espaço à direita', '550e8400-e29b-41d4-a716-446655440000 '],
  ['inválido: não-string (número)', 12345],
];

// JIDs: fora do corpus de falha — divergência FE×phoneOrJidField é por design.
const JID_CASES = [
  ['JID numérico (passa nos 3 validadores: ≥10 dígitos)', '5511999999999@s.whatsapp.net'],
  ['JID sem dígitos suficientes (phoneOrJid aceita; FE/phoneOnly rejeitam)', 'atendimento@s.whatsapp.net'],
  ['JID curto com @ (@ não salva do min 6 — todos rejeitam)', 'ab@cd'],
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const feSrc = read(FE_SCHEMAS);
const beContract = read(BE_CONTRACT);
const beHelpers = read(BE_HELPERS);
const pkg = JSON.parse(read(PKG));

let failures = 0;
const warnings = [];

function printTable(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => '  ' + cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ');
  console.log(line(header));
  console.log('  ' + widths.map((w) => '-'.repeat(w)).join('-+-'));
  for (const row of rows) console.log(line(row));
}

function verdictStr(v) {
  return v ? 'aceita' : 'rejeita';
}

// === TELEFONE: FE normalizedPhoneSchema × BE phoneOnlyField ===
console.log('\n=== TELEFONE — FE normalizedPhoneSchema × BE phoneOnlyField ===\n');

const fePhone = extractPhoneRules('normalizedPhoneSchema', feSrc, 'FE criticalPayloadSchemas');
const bePhoneOnly = extractPhoneRules('function phoneOnlyField', beHelpers, 'BE schemas.ts (phoneOnlyField)');
const bePhoneOrJid = extractPhoneRules('function phoneOrJidField', beHelpers, 'BE schemas.ts (phoneOrJidField)');

const fePhoneOk = phoneVerdict(fePhone);
const bePhoneOnlyOk = phoneVerdict(bePhoneOnly);
const bePhoneOrJidOk = phoneVerdict(bePhoneOrJid);

console.log(
  `  FE : min=${fePhone.min} max=${fePhone.max} digits>=${fePhone.digitsMin} (JID: não)` +
    `  |  BE: min=${bePhoneOnly.min} max=${bePhoneOnly.max} digits>=${bePhoneOnly.digitsMin} (JID: não)`
);

const phoneRows = [];
for (const [desc, value] of PHONE_CASES) {
  const fe = fePhoneOk(value);
  const be = bePhoneOnlyOk(value);
  const same = fe === be;
  if (!same) failures++;
  // Sanity floor: lixo canônico aceito por qualquer lado é warning (não fatal)
  if ((desc.startsWith('inválido') && (fe || be)) || (desc.startsWith('válido') && (!fe || !be))) {
    warnings.push(`telefone "${desc}" [${JSON.stringify(value)}]: FE=${verdictStr(fe)} BE=${verdictStr(be)} — veredito não bate com a descrição do corpus (revisar corpus OU schema)`);
  }
  phoneRows.push([desc, JSON.stringify(value), verdictStr(fe), verdictStr(be), same ? '✓' : '✗ DIVERGE']);
}
printTable(['caso', 'valor', 'FE', 'BE', 'paridade'], phoneRows);

console.log('\n  --- NOTA phoneOrJidField (divergência INTENCIONAL, não conta como falha) ---');
const jidRows = [];
for (const [desc, value] of JID_CASES) {
  jidRows.push([
    desc,
    JSON.stringify(value),
    verdictStr(fePhoneOk(value)),
    verdictStr(bePhoneOnlyOk(value)),
    verdictStr(bePhoneOrJidOk(value)),
  ]);
}
printTable(['caso (JID)', 'valor', 'FE', 'BE phoneOnly', 'BE phoneOrJid'], jidRows);
console.log(
  '  phoneOrJidField existe para campos que recebem telefone OU JID do WhatsApp\n' +
  '  (ver comentário "Bloco 4" em _shared/schemas.ts) — o FE de UX valida só\n' +
  '  telefone, por isso a coluna dele diverge em JIDs sem dígitos: por design.'
);

// === UUID: FE .uuid() × BE .uuid() ===
console.log('\n=== UUID — FE z.string().uuid() × BE z.string().uuid() ===\n');

const feUuid = extractUuidRules(feSrc, 'FE');
const beUuid = extractUuidRules(beContract, 'BE');

if (!feUuid || !beUuid) {
  console.error(
    `❌ [contract-sync] UUID: não achei .uuid() nem regex manual em ${!feUuid ? FE_SCHEMAS : BE_CONTRACT}.\n` +
    '   Fail-closed — atualize o parser deste script se o schema mudou de forma.'
  );
  process.exit(1);
}

const feZodMajor = (pkg.dependencies?.zod || pkg.devDependencies?.zod || '?').match(/\d+/)?.[0] || '?';
const beZodVersion = beContract.match(/esm\.sh\/zod@([\d.]+)/)?.[1] || '?';
if (feZodMajor !== beZodVersion.split('.')[0]) {
  warnings.push(
    `zod FE (v${feZodMajor}.x) e BE (v${beZodVersion}) estão em majors diferentes — ` +
    'paridade UUID verificada na semântica comum de .uuid() (8-4-4-4-12 hex); ' +
    'se um lado passar a usar version:/regex própria, este script precisa de nova regex canônica.'
  );
}
console.log(
  `  FE : ${feUuid.kind} (zod v${feZodMajor}.x em package.json)\n` +
  `  BE : ${beUuid.kind} (zod v${beZodVersion} via esm.sh)\n` +
  '  Regex de avaliação: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ (i)'
);

const uuidRows = [];
for (const [desc, value] of UUID_CASES) {
  const fe = typeof value === 'string' ? feUuid.regex.test(value) : false;
  const be = typeof value === 'string' ? beUuid.regex.test(value) : false;
  const same = fe === be;
  if (!same) failures++;
  if ((desc.startsWith('inválido') && (fe || be)) || (desc.startsWith('válido') && (!fe || !be))) {
    warnings.push(`uuid "${desc}" [${JSON.stringify(value)}]: FE=${verdictStr(fe)} BE=${verdictStr(be)} — veredito não bate com a descrição do corpus`);
  }
  uuidRows.push([desc, JSON.stringify(value), verdictStr(fe), verdictStr(be), same ? '✓' : '✗ DIVERGE']);
}
printTable(['caso', 'valor', 'FE', 'BE', 'paridade'], uuidRows);

// === EMAIL: BE-only → WARN (tipo ausente no FE) ===
console.log('\n=== EMAIL — BE EmailAddr × FE (ausente) ===\n');
const beEmail = /const\s+EmailAddr\s*=\s*z\.string\(\)\s*\.\s*trim\(\)\s*\.\s*email\(/.test(beContract);
const beEmailMax = beContract.match(/const\s+EmailAddr[^;]*?\.max\(\s*(\d+)\s*\)/)?.[1];
if (beEmail) {
  console.log(
    `  BE : EmailAddr = z.string().trim().email()${beEmailMax ? `.max(${beEmailMax})` : ''} (${BE_CONTRACT})`
  );
  warnings.push(
    'EMAIL: BE valida via EmailAddr (zod .email() + max ' +
      (beEmailMax || '?') +
      ") mas o FE NÃO tem validador de email em criticalPayloadSchemas.ts — tipo ausente em um dos lados (WARN, regra da etapa 87); sem par, não há comparação de corpus."
  );
} else {
  warnings.push(
    `EMAIL: não achei EmailAddr em ${BE_CONTRACT} — schema mudou? Atualize este script (fail-soft aqui porque o lado FE já é ausente).`
  );
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------
console.log('\n=== RESUMO ===');
if (warnings.length) {
  console.log('  ⚠ WARNs:');
  for (const w of warnings) console.log(`    - ${w}`);
}
if (failures > 0) {
  console.error(
    `\n❌ [contract-sync] ${failures} divergência(s) de veredito FE × BE nos validadores críticos.\n` +
    '   Um lado aceita o que o outro rejeita — bug de contrato (UX vs 422). Alinhe\n' +
    '   src/shared/criticalPayloadSchemas.ts com _shared/schemas.ts (ou vice-versa).'
  );
  process.exit(1);
}
console.log('\n✅ [contract-sync] paridade OK: telefone e UUID dão o mesmo veredito nos dois lados.');
