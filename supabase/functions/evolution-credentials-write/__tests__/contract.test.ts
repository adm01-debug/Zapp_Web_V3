/**
 * Contract tests — evolution-credentials-write@v1 (specs de segurança SEC-4).
 *
 * Suíte ESPECÍFICA de segurança da action 'save' do POST CRUD — complementa
 * (não duplica) a suíte irmã evolution-credentials/__tests__/contract.test.ts,
 * que cobre a estrutura do discriminatedUnion (campos obrigatórios, delete
 * UUID, gate parseOrReject, âncoras de fonte do 410).
 *
 * SEC-4 (Bloco 0, 2026-08-21): a api_url salva aqui é PERSISTIDA e usada em
 * chamadas futuras à Evolution API — antes era aceita qualquer string de URL,
 * abrindo SSRF persistido: um admin poderia apontar a instância para o
 * metadata endpoint (169.254.169.254) ou rede interna (RFC-1918) e a edge
 * chamaria lá com a service_role no bolso. O schema agora exige https público
 * via isSafeHttpsUrl (mesma blocklist localhost/RFC-1918/link-local/IPv6
 * interno do SEC-2). Estes specs travam o comportamento no contrato.
 *
 * Schema testado: EvolutionCredentialsWriteV1Schema (contract-schemas.ts) —
 * o MESMO usado em produção via parseOrReject, não mock.
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/evolution-credentials-write/__tests__/contract.test.ts
 */
import { assertEquals } from "jsr:@std/assert";
import { EvolutionCredentialsWriteV1Schema } from "../../_shared/contract-schemas.ts";

const VALID_SAVE = {
  action: "save" as const,
  instance_name: "wpp2",
  api_url: "https://evolution.atomicabr.com.br",
  api_key: "sk-test-123",
};

// SEC-4 — api_url apontando para rede interna/loopback deve ser rejeitada:
// o valor é persistido e consumido em fetches futuros (SSRF persistido).
const SSRF_API_URLS = [
  "https://169.254.169.254/latest/meta-data/", // cloud metadata endpoint
  "http://169.254.169.254/latest/meta-data/",  // idem, http
  "https://10.0.0.5/api",                      // RFC-1918 10/8
  "https://192.168.1.10/api",                  // RFC-1918 192.168/16
  "https://172.16.0.3/api",                    // RFC-1918 172.16/12
  "https://localhost/api",                     // localhost
  "https://127.0.0.1:8080/api",                // loopback IPv4
  "https://[::1]/api",                         // loopback IPv6
];

for (const api_url of SSRF_API_URLS) {
  Deno.test(`Contract: evolution-credentials-write v1 — save com api_url interna/loopback é rejeitado (SEC-4): ${api_url}`, () => {
    const result = EvolutionCredentialsWriteV1Schema.safeParse({ ...VALID_SAVE, api_url });
    assertEquals(result.success, false);
  });
}

Deno.test("Contract: evolution-credentials-write v1 — save com api_url http:// (não-https, SEC-4) é rejeitado", () => {
  const result = EvolutionCredentialsWriteV1Schema.safeParse({
    ...VALID_SAVE,
    api_url: "http://evolution.example.com",
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: evolution-credentials-write v1 — save com api_url que não é URL (SEC-4) é rejeitado", () => {
  const result = EvolutionCredentialsWriteV1Schema.safeParse({ ...VALID_SAVE, api_url: "not-a-url" });
  assertEquals(result.success, false);
});

Deno.test("Contract: evolution-credentials-write v1 — save com api_url HTTPS pública legítima passa (SEC-4)", () => {
  const result = EvolutionCredentialsWriteV1Schema.safeParse({
    ...VALID_SAVE,
    api_url: "https://evolution.example.com.br/api",
  });
  assertEquals(result.success, true);
});

// Regressão estrutural mínima do discriminatedUnion dentro desta suíte de
// segurança: um delete válido continua passando (SEC-4 não endureceu além
// do alvo — api_url da action save).
Deno.test("Contract: evolution-credentials-write v1 — delete com UUID válido continua passando (SEC-4 não-regression)", () => {
  const result = EvolutionCredentialsWriteV1Schema.safeParse({
    action: "delete",
    id: "24ab9157-eb2d-457f-a8a4-36c599f6113e",
  });
  assertEquals(result.success, true);
});
