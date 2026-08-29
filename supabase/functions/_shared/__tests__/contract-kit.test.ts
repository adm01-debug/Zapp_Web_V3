/**
 * Testes de contrato do Contract Kit (parseOrReject).
 *
 * Garante:
 *  1. FORMATO ÚNICO 422 — todo modo de falha produz o mesmo envelope
 *     { error, code, message, contract, details[] } com status 422.
 *  2. VERSIONAMENTO v1/v2 — negociação explícita (header/body), auto-detecção
 *     (mais nova → mais antiga) e rejeição de versão não suportada.
 *  3. RETROCOMPATIBILIDADE — v1 em sunset continua aceita, com headers
 *     `x-contract-deprecated: true` + `sunset`.
 *  4. ADVERSARIAL — campos ausentes, tipos errados, valores vazios, null,
 *     arrays, primitivos, chaves de prototype pollution.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-kit.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  parseOrReject,
  buildContractErrorBody,
  normalizeVersion,
  resolveRequestedVersion,
  respondWithContract,
  type ContractErrorBody,
  type ParseOk,
} from "../contract-kit.ts";
import {
  CONTRACT_SCHEMAS,
  TalkxSendV1Schema,
} from "../contract-schemas.ts";
import {
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
} from "../webhook-schemas.ts";
import { CONTRACTS } from "../contract-versions.ts";

const EVOLUTION = { v1: EvolutionWebhookV1Schema, v2: EvolutionWebhookV2Schema };
const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/fn", { method: "POST", headers });
}

/** Asserta o envelope 422 canônico — usado em TODOS os modos de falha. */
async function assertContractError(
  r: { ok: boolean; response?: Response; body?: ContractErrorBody },
  expectedCode: string,
): Promise<ContractErrorBody> {
  assertEquals(r.ok, false, "esperava falha de contrato");
  const res = r.response!;
  assertEquals(res.status, 422);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json() as ContractErrorBody;
  assertEquals(body.error, true);
  assertEquals(body.code, expectedCode);
  assert(typeof body.message === "string" && body.message.length > 0, "message vazia");
  assert(typeof body.contract === "string" && body.contract.includes("@"), "contract sem label name@vX");
  assert(Array.isArray(body.details), "details deve ser array");
  for (const d of body.details) {
    assert(typeof d.path === "string" && d.path.length > 0, "detail.path inválido");
    assert(typeof d.message === "string" && d.message.length > 0, "detail.message inválido");
  }
  return body;
}

// ─── 1. Normalização e resolução de versão ──────────────────────────────────

Deno.test("normalizeVersion: aliases numéricos e literais", () => {
  assertEquals(normalizeVersion("v1"), "v1");
  assertEquals(normalizeVersion("V2"), "v2");
  assertEquals(normalizeVersion("2.0"), "v2");
  assertEquals(normalizeVersion("1"), "v1");
  assertEquals(normalizeVersion(2), "v2");
  assertEquals(normalizeVersion(""), null);
  assertEquals(normalizeVersion(null), null);
  assertEquals(normalizeVersion({}), null);
});

Deno.test("resolveRequestedVersion: precedência header > contract_version > version", () => {
  const r = req({ "x-contract-version": "v2" });
  assertEquals(resolveRequestedVersion(r, { contract_version: "v1" }), "v2");
  assertEquals(resolveRequestedVersion(req(), { contract_version: "v1", version: "2.0" }), "v1");
  assertEquals(resolveRequestedVersion(req(), { version: "2.0" }), "v2");
  assertEquals(resolveRequestedVersion(req(), {}), null);
  assertEquals(resolveRequestedVersion(null, [1, 2, 3]), null, "array não carrega versão");
});

// ─── 2. Caminho feliz + auto-detecção v2→v1 (retrocompat) ────────────────────

Deno.test("evolution-webhook: payload v1 real (sem version) → aceito como v1 via fallback", () => {
  const payload = { event: "messages.upsert", instance: "wpp2", data: { id: "x" }, sender: null, apikey: null };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(r.ok);
  assertEquals(r.version, "v1");
});

Deno.test("evolution-webhook: payload v2 (version:'2.0') → detectado como v2, sem deprecação", () => {
  const payload = { event: "messages.upsert", instance: "wpp2", data: {}, version: "2.0", timestamp: Date.now() };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(r.ok);
  assertEquals(r.version, "v2");
  assertEquals(r.deprecated, false);
  assertEquals(r.headers["x-contract-version"], "v2");
  assertEquals(r.headers["x-contract-deprecated"], undefined);
});

Deno.test("retrocompat: v1 em janela de sunset → aceito com headers de deprecação", () => {
  const sunset = CONTRACTS["evolution-webhook"].sunset?.v1;
  assert(sunset, "registro deve ter sunset para v1");
  assert(Date.parse(sunset!) > Date.now(), "teste pressupõe sunset no futuro");
  const payload = { event: "connection.update", instance: "wpp2", data: null, sender: null, apikey: null };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(r.ok);
  assertEquals(r.version, "v1");
  assertEquals(r.deprecated, true);
  assertEquals(r.headers["x-contract-deprecated"], "true");
  assertEquals(r.headers["sunset"], sunset);
});

Deno.test("versão explícita v1 via header ainda é aceita (não removida durante sunset)", () => {
  const payload = { event: "messages.upsert", instance: "wpp2" };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req({ "x-contract-version": "v1" }), payload);
  assert(r.ok);
  assertEquals(r.version, "v1");
  assertEquals(r.deprecated, true);
});

// ─── 3. Modos de falha → envelope único ──────────────────────────────────────

Deno.test("422 unsupported_contract_version: v3 pedida explicitamente", async () => {
  const r = parseOrReject("evolution-webhook", EVOLUTION, req({ "x-contract-version": "v3" }), { event: "x", instance: "y" });
  const body = await assertContractError(r, "unsupported_contract_version");
  assert(body.message.includes("v1") && body.message.includes("v2"), "mensagem deve listar suportadas");
});

Deno.test("422 invalid_json: body null (JSON inválido)", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), null);
  await assertContractError(r, "invalid_json");
});

Deno.test("422 invalid_json: body primitivo (string/number/bool)", async () => {
  for (const b of ["texto", 42, true]) {
    const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), b);
    await assertContractError(r, "invalid_json");
  }
});

Deno.test("422 contract_violation: campo obrigatório ausente", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { action: "start" });
  const body = await assertContractError(r, "contract_violation");
  assert(body.details.some((d) => d.path === "campaignId"), "details deve apontar campaignId");
});

Deno.test("422 contract_violation: tipo errado (number em vez de uuid string)", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { campaignId: 123, action: "start" });
  const body = await assertContractError(r, "contract_violation");
  assert(body.details.some((d) => d.path === "campaignId"));
});

Deno.test("422 contract_violation: valor vazio (uuid='')", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { campaignId: "", action: "start" });
  await assertContractError(r, "contract_violation");
});

Deno.test("422 contract_violation: enum fora do domínio (action='resume')", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { campaignId: UUID, action: "resume" });
  const body = await assertContractError(r, "contract_violation");
  assert(body.details.some((d) => d.path === "action"));
});

Deno.test("422 contract_violation: campo extra em schema .strict()", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { campaignId: UUID, evil: 1 });
  await assertContractError(r, "contract_violation");
});

Deno.test("adversarial: __proto__/constructor como chaves não quebram o kit", async () => {
  const raw = JSON.parse('{"campaignId":"' + UUID + '","__proto__":{"admin":true},"constructor":{"x":1}}');
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), raw);
  // .strict() rejeita chaves extras — resposta deve ser 422 limpo, nunca crash
  await assertContractError(r, "contract_violation");
  assertEquals(({} as Record<string, unknown>).admin, undefined, "prototype não pode ter sido poluído");
});

Deno.test("consistência: os 3 códigos de erro produzem envelope idêntico em shape", async () => {
  const cases: Array<[unknown, Record<string, string>, string]> = [
    [null, {}, "invalid_json"],
    [{ campaignId: UUID }, { "x-contract-version": "v9" }, "unsupported_contract_version"],
    [{}, {}, "contract_violation"],
  ];
  const shapes = new Set<string>();
  for (const [body, headers, code] of cases) {
    const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(headers), body);
    const eb = await assertContractError(r, code);
    shapes.add(Object.keys(eb).sort().join(","));
  }
  assertEquals(shapes.size, 1, "todos os modos de falha devem ter as mesmas chaves no envelope");
});

Deno.test("requestId propaga para o envelope quando fornecido", () => {
  const eb = buildContractErrorBody("talkx-send", "v1", "contract_violation", "x", [], "req-123");
  assertEquals(eb.requestId, "req-123");
  const eb2 = buildContractErrorBody("talkx-send", "v1", "contract_violation", "x", []);
  assertEquals("requestId" in eb2, false, "requestId ausente não deve virar undefined serializado");
});

// ─── Etapa 28 (Bloco 2, A3) — truncamento de details sinalizado, não escondido ──

Deno.test("truncated: buildContractErrorBody só inclui a chave quando true", () => {
  const truncated = buildContractErrorBody("talkx-send", "v1", "contract_violation", "x", [], undefined, true);
  assertEquals(truncated.truncated, true);
  const notTruncated = buildContractErrorBody("talkx-send", "v1", "contract_violation", "x", [], undefined, false);
  assertEquals("truncated" in notTruncated, false, "truncated:false não deve virar chave serializada");
  const omitted = buildContractErrorBody("talkx-send", "v1", "contract_violation", "x", []);
  assertEquals("truncated" in omitted, false, "truncated ausente por padrão");
});

Deno.test("422 contract_violation: schema com >25 campos ausentes sinaliza truncated:true e corta details em 25", async () => {
  const fields: Record<string, z.ZodTypeAny> = {};
  for (let i = 0; i < 30; i++) fields[`campo${i}`] = z.string();
  const bigSchema = z.object(fields).strict();

  const r = parseOrReject("truncation-test", { v1: bigSchema }, req(), {});
  const body = await assertContractError(r, "contract_violation");
  assertEquals(body.details.length, 25, "details deve cortar em 25 mesmo com 30 issues reais");
  assertEquals(body.truncated, true);
});

Deno.test("422 contract_violation: schema com <=25 campos ausentes NÃO sinaliza truncated", async () => {
  const fields: Record<string, z.ZodTypeAny> = {};
  for (let i = 0; i < 5; i++) fields[`campo${i}`] = z.string();
  const smallSchema = z.object(fields).strict();

  const r = parseOrReject("truncation-test", { v1: smallSchema }, req(), {});
  const body = await assertContractError(r, "contract_violation");
  assertEquals(body.details.length, 5);
  assertEquals("truncated" in body, false, "sem corte real, a chave não deve aparecer");
});

// ─── Etapa 54/71 (PLANO-100-CONTRATOS-EDGE, 2026-08-25): respondWithContract ──

Deno.test("etapa 71: contrato versionado v2 → respondWithContract devolve x-contract-version", () => {
  const payload = { event: "messages.upsert", instance: "wpp2", data: {}, version: "2.0", timestamp: Date.now() };
  const parsed = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(parsed.ok === true);
  const res = respondWithContract(parsed, { success: true }, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("x-contract-version"), "v2");
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*", "headers de init (CORS extras) preservados");
});

Deno.test("etapa 71: contrato em sunset ativo → headers sunset + x-contract-deprecated presentes", () => {
  // v1 do evolution-webhook está em janela de sunset (o teste de retrocompat
  // acima já garante data futura no registro) — a resposta de sucesso não
  // pode perder os headers de deprecação na migração pro helper.
  const payload = { event: "connection.update", instance: "wpp2", data: null, sender: null, apikey: null };
  const parsed = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(parsed.ok === true);
  assert(parsed.deprecated === true, "teste pressupõe v1 em janela de sunset");
  const res = respondWithContract(parsed, { ok: true });
  assertEquals(res.status, 200, "sem init.status → 200 default");
  assertEquals(res.headers.get("x-contract-version"), "v1");
  assertEquals(res.headers.get("x-contract-deprecated"), "true");
  assertEquals(res.headers.get("sunset"), CONTRACTS["evolution-webhook"].sunset?.v1);
});

Deno.test("etapa 71: merge não deixa init.headers derrubar headers de contrato nem Content-Type", () => {
  // Risco simulado da etapa 54: um CORS extra (ou bug de call site) tentando
  // sobrescrever x-contract-version/Content-Type — o contrato sempre vence.
  const parsed: ParseOk = {
    ok: true, data: null, version: "v9", deprecated: false,
    headers: { "x-contract-version": "v9", "sunset": "Fri, 01 Jan 2027 00:00:00 GMT" },
  };
  const res = respondWithContract(parsed, {}, {
    status: 201,
    headers: { "x-contract-version": "v1", "Content-Type": "text/plain", "X-Extra": "kept" },
  });
  assertEquals(res.status, 201, "init.status preservado");
  assertEquals(res.headers.get("x-contract-version"), "v9", "header de contrato vence init.headers");
  assertEquals(res.headers.get("sunset"), "Fri, 01 Jan 2027 00:00:00 GMT");
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(res.headers.get("X-Extra"), "kept");
});

// ─── Etapa 59 (A4, PLANO-100-CONTRATOS-EDGE): `version` de negócio × hint ────

Deno.test("etapa 59 (a): hint legítimo do body continua resolvido (contrato versionado real)", () => {
  // sicoob-bridge manda version no body (v1 sem declaração no schema; v2
  // declara z.literal("2.0") — marcador de envelope, não campo de negócio).
  // A negociação explícita precisa continuar roteando pra versão pedida.
  const r1 = parseOrReject("sicoob-bridge", CONTRACT_SCHEMAS["sicoob-bridge"], req(), {
    action: "mark_read", external_ids: ["abc"], version: "v1",
  });
  assert(r1.ok === true);
  assertEquals(r1.version, "v1", "hint body.version='v1' deve rotear pra v1");

  const r2 = parseOrReject("sicoob-bridge", CONTRACT_SCHEMAS["sicoob-bridge"], req(), {
    action: "mark_read", external_ids: ["abc"], version: "2.0", timestamp: 1750000000,
  });
  assert(r2.ok === true);
  assertEquals(r2.version, "v2", "hint body.version='2.0' deve rotear pra v2 (literal)");
});

Deno.test("etapa 59 (a): hint literal do body segue sendo PEDIDO explícito (não só auto-detecção)", () => {
  // Discriminante: payload com shape v1 + version:'2.0' sem timestamp. Se o
  // hint fosse ignorado, a auto-detecção tentaria v2, falharia e CAIRIA pra
  // v1 (aceito). Com o hint respeitado, o pedido explícito de v2 falha SOZINHO
  // — 422 contract_violation, provando que o literal não foi descartado.
  const payload = { event: "messages.upsert", instance: "wpp2", data: {}, sender: null, apikey: null, version: "2.0" };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(r.ok === false, "pedido explícito de v2 com payload inválido deve 422, não cair pra v1");
  assertEquals(r.body.code, "contract_violation");
});

Deno.test("etapa 59 (b): payload com campo de negócio `version` NÃO gera mais 422 espúrio", () => {
  // Contrato hipotético cujo payload carrega `version` de NEGÓCIO (versão do
  // app integrador) declarada no schema. Antes do fix: normalizeVersion("3.1.4")
  // → "3.1.4" fora de supported → 422 unsupported_contract_version espúrio.
  const businessV1 = z.object({ version: z.string(), event: z.string() }).passthrough();
  // Valores string realistas de versão de app: "3" normaliza pra "v3" (fora
  // de supported) e "3.1.4" passa cru — ambos geravam 422 espúrio antes.
  for (const businessVersion of ["3.1.4", "3"]) {
    const r = parseOrReject("truncation-test", { v1: businessV1 }, req(), {
      version: businessVersion, event: "sync",
    });
    assert(r.ok === true, `version de negócio ${String(businessVersion)} não pode gerar 422`);
    assertEquals(r.version, "v1", "deve resolver por auto-detecção de formato");
  }
});

Deno.test("etapa 59: discriminatedUnion com campo version de negócio também é protegido", () => {
  // Mesmo formato real do sicoob-bridge (branches introspectadas via
  // _def.options) — aqui com version de NEGÓCIO no branch.
  const du = z.discriminatedUnion("action", [
    z.object({ action: z.literal("sync"), version: z.string() }).passthrough(),
  ]);
  const r = parseOrReject("truncation-test", { v1: du }, req(), { action: "sync", version: "3.1.4" });
  assert(r.ok === true, "hint não pode sequestrar branch com campo version de negócio");
  assertEquals(r.version, "v1");
});

Deno.test("etapa 59: header x-contract-version segue mandando mesmo com campo version de negócio", () => {
  const businessV1 = z.object({ version: z.string(), event: z.string() }).passthrough();
  const r = parseOrReject("truncation-test", { v1: businessV1 }, req({ "x-contract-version": "v1" }), {
    version: "3.1.4", event: "sync",
  });
  assert(r.ok === true);
  assertEquals(r.version, "v1");
});

Deno.test("etapa 59: body.version pedindo versão inexistente continua 422 (quando não é campo de negócio)", () => {
  // talkx-send não declara `version` → hint segue valendo; v9 não existe.
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), {
    campaignId: UUID, action: "start", version: "v9",
  });
  assert(r.ok === false);
  assertEquals(r.body.code, "unsupported_contract_version");
});

Deno.test("etapa 59: hint de body apontando pra versão SUPORTADA segue honrado (semântica sunset/410 preservada)", () => {
  // Espelha o fixture do contract-sunset-policy.test.ts: schema v2 declara
  // `version` (não-literal), mas o hint "1" aponta pra v1 SUPORTADA — o
  // desarme da etapa 59 só vale para hint FORA de supported; pedido explícito
  // de versão suportada (roteamento E 410 pós-sunset) não pode mudar.
  // Discriminante: sem o hint, a auto-detecção tentaria v2 primeiro (que
  // também valida este payload) → v2; com o hint honrado → v1.
  const synth = {
    v1: z.object({ legacy_field: z.string() }),
    v2: z.object({ legacy_field: z.string(), version: z.string() }),
  };
  const r = parseOrReject("truncation-test", synth, req(), { legacy_field: "ok", version: "1" });
  assert(r.ok === true);
  assertEquals(r.version, "v1", "hint suportado do body não pode ser desarmado");
});



Deno.test("integridade: CONTRACT_SCHEMAS cobre todas as versões suportadas dos contratos registrados", () => {
  for (const [name, schemas] of Object.entries(CONTRACT_SCHEMAS)) {
    const spec = CONTRACTS[name];
    assert(spec, `contrato '${name}' precisa existir em contract-versions.ts`);
    for (const v of spec.supported) {
      assert(schemas[v], `contrato '${name}' sem schema para versão suportada '${v}'`);
    }
    assert(spec.supported.includes(spec.current), `'${name}': current fora de supported`);
  }
});
