/**
 * Contract tests — zapp-n8n-sync@v1 (specs de segurança SEC-4, camada sintática).
 *
 * Suíte de SEGURANÇA da action 'configure' — complementa (não duplica) as
 * suítes irmãs index.test.ts (unit do núcleo) e behavioral.test.ts (ponta-a-
 * ponta do handler: auth, gate, estados, configure 200/400).
 *
 * SEC-4 (Bloco 0, 2026-08-21): baseUrl é persistida em zapp.n8n_config e
 * consumida por dispatches futuros. A defesa dividiu-se em DUAS camadas:
 *   - HANDLER (já vigente, ancorada em behavioral A5/B4-B5):
 *     normalizeBaseUrl prefixa https:// e isSafeHttpsUrl bloqueia rede
 *     interna/privada APÓS a normalização;
 *   - CONTRATO (esta suíte): validação SINTÁTICA — baseUrl sem estrutura de
 *     URL (ex.: texto livre sem scheme/host) deve cair já no gate 422, antes
 *     de chegar ao handler. Endurecimento em curso no schema pelo Agente B
 *     (ZappN8nSyncV1Schema.configure.baseUrl .url()); se esta suíte estiver
 *     VERMELHA, o endurecimento ainda não chegou ao _shared — ver comentário
 *     no teste S1.
 *
 * Schema testado: ZappN8nSyncV1Schema (contract-schemas.ts, registro
 * CONTRACT_SCHEMAS['zapp-n8n-sync']) — o MESMO usado em produção, não mock.
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/zapp-n8n-sync/__tests__/contract.test.ts
 */
import { assertEquals } from "jsr:@std/assert";
import { ZappN8nSyncV1Schema } from "../../_shared/contract-schemas.ts";

// S1 — SEC-4, camada sintática: string SEM estrutura de URL (sem scheme, sem
// host, com espaços) deve ser rejeitada no contrato. DEPENDÊNCIA: requer o
// .url() que o Agente B está adicionando a baseUrl em contract-schemas.ts
// (paralelo a esta suíte). Se este teste falhar com success === true, o
// endurecimento do schema ainda NÃO chegou ao _shared — não é bug do teste,
// é o estado transitório do trabalho paralelo (reportar "aguardando Agente B").
// Nota: host cru sem scheme ("n8n.example.com") NÃO é caso desta suíte — o
// handler o normaliza com https:// por design (ver behavioral B4); a regex
// abaixo usa um valor que não é URL nem após normalização prefixada
// ("https://not a url at all" continua inválida).
Deno.test("Contract: zapp-n8n-sync v1 — configure com baseUrl sem estrutura de URL é rejeitado no gate (SEC-4, sintático)", () => {
  const result = ZappN8nSyncV1Schema.safeParse({ action: "configure", baseUrl: "not a url at all" });
  assertEquals(result.success, false);
});

Deno.test("Contract: zapp-n8n-sync v1 — configure com baseUrl \"foo bar\" (espaços, sem host) é rejeitado no gate (SEC-4, sintático)", () => {
  const result = ZappN8nSyncV1Schema.safeParse({ action: "configure", baseUrl: "foo bar" });
  assertEquals(result.success, false);
});

// S2 — contraforte do S1: URL https completa e pública continua passando no
// contrato, com ou sem o .url() do endurecimento (não-regressão).
Deno.test("Contract: zapp-n8n-sync v1 — configure com baseUrl https válida e pública passa (SEC-4 não-regression)", () => {
  const result = ZappN8nSyncV1Schema.safeParse({ action: "configure", baseUrl: "https://n8n.example.com" });
  assertEquals(result.success, true);
});

Deno.test("Contract: zapp-n8n-sync v1 — action status válida segue passando (SEC-4 não-regression)", () => {
  const result = ZappN8nSyncV1Schema.safeParse({ action: "status" });
  assertEquals(result.success, true);
});
