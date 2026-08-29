/**
 * Contract tests — voice-changer@v1 (Etapa 34, PLANO-100, 2026-08-25).
 *
 * O contrato voice-changer@v1 tem DUAS variantes por content-type no MESMO
 * handler:
 *   - MULTIPART (canal público da UI): registro canônico
 *     CONTRACT_SCHEMAS['voice-changer'] → VoiceChangerMultipartV1Schema
 *     (audio File obrigatório);
 *   - JSON (fila/queue): VoiceChangerQueueContractMap → VoiceChangerV1Schema
 *     ({ task_id?, authorized? }), exportado de contract-schemas-infra.ts.
 *
 * Etapa 34 fechou o drift registro×handler: o ramo JSON montava o version-map
 * INLINE no index.ts ({ v1: VoiceChangerV1Schema }) — agora importa o map
 * canônico do módulo de registro. Esta suíte trava:
 *   1. Identidade de referências entre canônico, map, registro legado e fonte
 *      (registro == efetivo — nada de cópia paralela);
 *   2. A decisão de NÃO criar contrato 'voice-changer-queue' à parte
 *      (Invariante 1b do contract-registry-integrity: 1 entrada CONTRACTS por
 *      entrada CONTRACT_SCHEMAS; a variante não tem diretório de function);
 *   3. O comportamento das duas variantes (multipart × JSON).
 *
 * Suítes irmãs: _shared/__tests__/contract-multipart-matrix.test.ts cobre a
 * matriz adversarial da variante multipart via CONTRACT_SCHEMAS; esta suíte
 * foca a variante JSON e a reconciliação.
 *
 * Rodar: deno test --allow-net --allow-read supabase/functions/voice-changer/__tests__/contract.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert";
import { CONTRACT_SCHEMAS, VoiceChangerQueueContractMap, EdgeFunctionContractSchemas } from "../../_shared/contract-schemas.ts";
import {
  VoiceChangerMultipartV1Schema,
  VoiceChangerQueueContractMap as MapDoModuloDeRegistro,
} from "../../_shared/contract-schemas-infra.ts";
import { VoiceChangerV1Schema } from "../../_shared/schemas.ts";
import { CONTRACTS } from "../../_shared/contract-versions.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

// ─── Etapa 34: âncoras de fonte (contrato estrutural do index.ts real) ──────

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

Deno.test("Etapa 34: ramo JSON do handler usa o VoiceChangerQueueContractMap importado (nunca inline)", () => {
  assert(
    /parseOrReject\(\s*['"]voice-changer['"]\s*,\s*VoiceChangerQueueContractMap\s*,/.test(SOURCE),
    "index.ts deve chamar parseOrReject('voice-changer', VoiceChangerQueueContractMap, ...) no ramo JSON",
  );
  assert(
    /from ["'][^"']*contract-schemas\.ts["']/.test(SOURCE),
    "index.ts deve importar o map do ponto unificado (contract-schemas.ts, que re-exporta de contract-schemas-infra.ts)",
  );
});

Deno.test("Etapa 34: handler NÃO monta version-map inline de VoiceChangerV1Schema", () => {
  assert(
    !/\{\s*v1:\s*VoiceChangerV1Schema\s*\}/.test(SOURCE),
    "literal { v1: VoiceChangerV1Schema } inline é o drift que a Etapa 34 removeu",
  );
});

// ─── Etapa 34: identidade de referências (registro == efetivo) ──────────────

Deno.test("Etapa 34: registro canônico aponta a variante MULTIPART", () => {
  assert(CONTRACT_SCHEMAS["voice-changer"], "voice-changer registrado em CONTRACT_SCHEMAS");
  assertEquals(
    CONTRACT_SCHEMAS["voice-changer"].v1,
    VoiceChangerMultipartV1Schema,
    "CONTRACT_SCHEMAS['voice-changer'].v1 deve ser a variante multipart (canal público)",
  );
});

Deno.test("Etapa 34: map da variante JSON é idêntico à fonte e ao re-export (sem cópia paralela)", () => {
  assertEquals(VoiceChangerQueueContractMap.v1, VoiceChangerV1Schema);
  assertEquals(MapDoModuloDeRegistro, VoiceChangerQueueContractMap, "re-export em contract-schemas.ts deve ser a MESMA referência");
});

Deno.test("Etapa 34: registro legado (EdgeFunctionContractSchemas) usa a MESMA referência do map — zero drift", () => {
  assertEquals(
    EdgeFunctionContractSchemas["voice-changer"].v1,
    VoiceChangerQueueContractMap.v1,
    "EdgeFunctionContractSchemas['voice-changer'].v1 deve apontar o mesmo schema do map canônico",
  );
});

Deno.test("Etapa 34: variante JSON NÃO virou contrato próprio (Invariante 1b preservada)", () => {
  assertEquals("voice-changer-queue" in CONTRACT_SCHEMAS, false, "sem entrada fantasma em CONTRACT_SCHEMAS");
  assertEquals("voice-changer-queue" in CONTRACTS, false, "sem contrato em CONTRACTS");
  assertEquals(CONTRACTS["voice-changer"].supported, ["v1"], "voice-changer segue 1 contrato, 1 versão, 2 variantes por content-type");
});

// ─── Variante JSON (fila/queue) — VoiceChangerV1Schema ──────────────────────

Deno.test("voice-changer JSON: body mínimo {} é aceito (fila busca áudio por task_id no storage)", () => {
  assertEquals(VoiceChangerV1Schema.safeParse({}).success, true);
});

Deno.test("voice-changer JSON: { task_id, authorized } válido é aceito", () => {
  assertEquals(
    VoiceChangerV1Schema.safeParse({ task_id: "6f0c2c88-6e96-4c5f-8c0e-2f1d5a9b7c3d", authorized: true }).success,
    true,
  );
});

Deno.test("voice-changer JSON: campo extra é rejeitado (.strict())", () => {
  assertEquals(VoiceChangerV1Schema.safeParse({ task_id: "abc", extra: 1 }).success, false);
});

Deno.test("voice-changer JSON: authorized string é rejeitado (boolean-only no JSON; string é coisa do multipart)", () => {
  assertEquals(VoiceChangerV1Schema.safeParse({ authorized: "true" }).success, false);
});

Deno.test("voice-changer JSON: task_id vazio é rejeitado (min 1)", () => {
  assertEquals(VoiceChangerV1Schema.safeParse({ task_id: "" }).success, false);
});

Deno.test("voice-changer JSON: task_id null é rejeitado (nullable existe só na variante multipart)", () => {
  assertEquals(VoiceChangerV1Schema.safeParse({ task_id: null }).success, false);
});

// ─── Gate completo (parseOrReject) com o map canônico ───────────────────────

Deno.test("gate JSON: payload de fila válido → ok, versão v1 negociada", () => {
  const payload = { task_id: "task-1", authorized: false };
  const req = new Request("https://edge.local/voice-changer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const r = parseOrReject("voice-changer", VoiceChangerQueueContractMap, req, payload, {});
  assertEquals(r.ok, true);
  if (r.ok === true) {
    assertEquals(r.version, "v1");
    assertEquals(r.headers["x-contract-version"], "v1");
  }
});

Deno.test("gate JSON: body null → 422 invalid_json", async () => {
  const r = parseOrReject("voice-changer", VoiceChangerQueueContractMap, null, null, {});
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    const body = await r.response.json() as { code: string };
    assertEquals(body.code, "invalid_json");
  }
});

Deno.test("gate JSON: campo extra → 422 contract_violation", async () => {
  const payload = { task_id: "t", extra: 1 } as Record<string, unknown>;
  const r = parseOrReject("voice-changer", VoiceChangerQueueContractMap, null, payload, {});
  assertEquals(r.ok, false);
  if (r.ok === false) {
    const body = await r.response.json() as { code: string; contract: string };
    assertEquals(body.code, "contract_violation");
    assertEquals(body.contract, "voice-changer@v1");
  }
});

Deno.test("gate JSON: header x-contract-version: v1 explícito é aceito (negociação)", () => {
  const payload = { authorized: true };
  const req = new Request("https://edge.local/voice-changer", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-contract-version": "v1" },
    body: JSON.stringify(payload),
  });
  const r = parseOrReject("voice-changer", VoiceChangerQueueContractMap, req, payload, {});
  assertEquals(r.ok, true);
});

// ─── Variante MULTIPART (smoke — matriz adversarial completa no _shared) ────

Deno.test("voice-changer multipart: File + campos opcionais é aceito", () => {
  const audio = new File([new Uint8Array([1, 2, 3])], "in.mp3", { type: "audio/mpeg" });
  assertEquals(
    VoiceChangerMultipartV1Schema.safeParse({ audio, voice_preset: "grave", task_id: null, authorized: "true" }).success,
    true,
  );
});

Deno.test("voice-changer multipart: sem audio é rejeitado", () => {
  assertEquals(VoiceChangerMultipartV1Schema.safeParse({ voice_preset: "grave" }).success, false);
});
