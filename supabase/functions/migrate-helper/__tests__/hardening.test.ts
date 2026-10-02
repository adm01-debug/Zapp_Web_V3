/**
 * Hardening tests — migrate-helper (auditoria 22D, 2026-10-02).
 *
 * A chave de acesso anterior (`recover2026v3key9x`) estava commitada no
 * repo e vazou no histórico do git — credencial comprometida. O
 * hardening troca o literal por MIGRATE_HELPER_ACCESS_KEY via env,
 * remove o CORS `*` (endpoint máquina→máquina) e fail-closed (503) sem
 * a env configurada. Estes testes garantem que a regressão não retorna:
 * nenhum literal de chave no source, fail-closed intacto e 401 na
 * ausência da chave.
 */
import { assertEquals, assertMatch, assert } from "jsr:@std/assert";

const SOURCE = await Deno.readTextFile(new URL("../index.ts", import.meta.url));

Deno.test("Hardening: chave vem de env, NUNCA literal no source", () => {
  assertMatch(SOURCE, /Deno\.env\.get\("MIGRATE_HELPER_ACCESS_KEY"\)/);
});

Deno.test("Hardening: chave comprometida do histórico ausente do source", () => {
  // o literal antigo vazou no git — não pode reaparecer em nenhuma forma
  assertEquals(SOURCE.includes("recover2026v3key9x"), false, "chave comprometida hardcoded");
  assertEquals(/ACCESS_KEY\s*=\s*["'`][^"'`]+["'`]/.test(SOURCE), false, "literal de chave no source");
});

Deno.test("Hardening: fail-closed — sem env retorna 503 not_configured", () => {
  assertMatch(SOURCE, /!ACCESS_KEY\) return json\(\{ error: "not_configured" \}, 503\)/);
});

Deno.test("Hardening: 503 not_configured vem ANTES da verificação da chave", () => {
  const notConf = SOURCE.indexOf('error: "not_configured"');
  const unauth = SOURCE.indexOf('error: "unauthorized"');
  assert(notConf > 0 && unauth > notConf, "fail-closed deve preceder o 401");
});

Deno.test("Hardening: sem x-access-key correto → 401 unauthorized", () => {
  // timingSafeEqual em vez de !== — comparação em tempo constante (achado
  // da validação 5-agentes: !== vaza timing do prefixo da chave)
  assertMatch(SOURCE, /timingSafeEqual\(key \?\? "", ACCESS_KEY\)\) return json\(\{ error: "unauthorized" \}, 401\)/);
});

Deno.test("Hardening: CORS sem wildcard — sem Access-Control-Allow-Origin: *", () => {
  assertEquals(/Access-Control-Allow-Origin["']?\s*:\s*["']\*/.test(SOURCE), false);
});

Deno.test("Hardening: action=credentials exige chave (depois do 401, não antes)", () => {
  const unauth = SOURCE.indexOf('error: "unauthorized"');
  const creds = SOURCE.indexOf('action === "credentials"');
  assert(unauth > 0 && creds > unauth, "credentials deve ficar atrás do gate 401");
});
