/**
 * ETAPA 68 (PLANO-100-CONTRATOS-EDGE) — PADRÃO de teste de integração via
 * fetch contra handler REAL.
 * -----------------------------------------------------------------------------
 * O que este arquivo estabelece (padrão a replicar em novos handlers):
 *
 *   1. IMPORTA o handler real (`index.ts` do function dir) — não uma cópia
 *      da lógica de validação. O gate `parseOrReject`, o CORS e o roteamento
 *      exercitados são os de produção.
 *   2. CAPTURA o callback passado a `Deno.serve` stubando `Deno.serve` ANTES
 *      do import dinâmico — nenhum servidor sobe (sem porta ocupada, dois
 *      handlers no mesmo arquivo não conflitam).
 *   3. MONTA um `Request` real (`new Request('https://…/functions/v1/<fn>')`)
 *      e chama `handler(request)` — a resposta é uma `Response` HTTP de verdade.
 *   4. ASSERTA O JSON DA RESPOSTA (`await res.json()`), não um parse em
 *      memória: envelope 422 canônico `{error:true, code, message, contract,
 *      details[]}` (contract-kit.ts) e envelope de não-validação
 *      `{error:true, code, message}` (errorEnvelope/validation.ts).
 *   5. IO pós-gate (PostgREST) é isolado por um STUB HTTP local mínimo na
 *      porta 0 — supabase-js real faz fetch real contra ele. Nada de mock de
 *      módulo: o mock é a rede, não o código.
 *   6. HIGIENE DE PROCESSO: toda env tocada entra em ENV_TOUCHED (snapshot
 *      antes do set) e é restaurada no teardown final, com guard de asserção.
 *      Suítes vizinhas rodam NO MESMO PROCESSO (`deno test` sem --parallel):
 *      env vazada quebra testes alheios (caso real: require-user-fast-path).
 *
 * Handlers cobertos (gate puro antes de IO):
 *   - zapp-email-inbound-webhook — auth fail-closed por env (sem Svix) →
 *     rate-limit → gate. 422 atingível sem tocar DB; happy-path usa o stub.
 *   - whatsapp-cloud-webhook — HMAC (APP_SECRET) → gate; happy-path benign
 *     (`entry: []`) não toca persistência de mensagens.
 *
 * Nota (b): nenhum dos dois contratos é `.strict()` — webhooks EXTERNOS são
 * permissivos por design (incidente 2026-07-03, regra no topo do
 * contract-kit.ts: 422 indevido em payload real do provedor = perda de
 * dados). Por isso a asserção de "rejeição de contrato" usa o que cada
 * schema REALMENTE endurece: superRefine (email) e z.literal/chave obrigatória
 * (whatsapp) — e a PERMISSIVIDADE a campos extras é travada como contrato
 * (aceitos, 2xx), não como acidente.
 *
 * CI: roda no loop por-arquivo do deno-contract-tests.yml
 * (`deno test --allow-net --allow-env --allow-read <este arquivo>`).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type EdgeHandler = (req: Request) => Response | Promise<Response>;

const ORIGIN = "https://zapp.atomicabr.com.br"; // exact match da allowlist do cors.ts
const EMAIL_SECRET = "inbound-test-secret-2026";
const WA_APP_SECRET = "wa-cloud-test-app-secret";
const WA_VERIFY_TOKEN = "wa-cloud-test-verify-token";
const EMAIL_ROW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

// ─── Stub PostgREST (rede local, porta 0) ────────────────────────────────────
// Responde o MÍNIMO que supabase-js 2.x precisa: 2xx + JSON. RPC de vault
// devolve `null` (getSecret → null sem env). POST com Accept
// `application/vnd.pgrst.object+json` (`.maybeSingle()` não-GET) recebe um
// OBJETO único; demais chamadas recebem array.
const stubServer = Deno.serve({ hostname: "127.0.0.1", port: 0 }, (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const accept = req.headers.get("accept") ?? "";
  if (path.includes("/rpc/")) {
    return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
  }
  if (req.method === "POST" && accept.includes("vnd.pgrst.object+json")) {
    return new Response(JSON.stringify({ id: EMAIL_ROW_ID }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response("[]", { status: req.method === "POST" ? 201 : 200, headers: { "content-type": "application/json" } });
});
const STUB_URL = `http://127.0.0.1:${(stubServer.addr as Deno.NetAddr).port}`;

// ─── Env (ANTES dos imports dinâmicos — whatsapp-cloud lê env em módulo) ─────
// HIGIENE OBRIGATÓRIA: `deno test` sem --parallel roda suítes vizinhas NO
// MESMO PROCESSO — env setada aqui e não restaurada vaza para elas. Prova
// real: SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY esquecida duplicava o candidato
// self-hosted de auth.ts (url+anon+service_role ⇒ 2 candidatos) e quebrava
// `require-user-fast-path` ("iss mismatch": 3 fetches ≠ 2 esperados).
// TODA chave tocada entra em ENV_TOUCHED e é restaurada no teardown final.
const ENV_TOUCHED = [
  "SELFHOSTED_SUPABASE_URL",
  "SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY",
  "EMAIL_INBOUND_WEBHOOK_SECRET",
  "RESEND_INBOUND_SIGNING_SECRET",
  "WHATSAPP_CLOUD_APP_SECRET",
  "WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN",
] as const;
const envSnapshot = new Map<string, string | undefined>(
  ENV_TOUCHED.map((k) => [k, Deno.env.get(k)]),
);
function restoreEnvSnapshot(): void {
  for (const [k, v] of envSnapshot) {
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
}

Deno.env.set("SELFHOSTED_SUPABASE_URL", STUB_URL);
Deno.env.set("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("EMAIL_INBOUND_WEBHOOK_SECRET", EMAIL_SECRET);
Deno.env.delete("RESEND_INBOUND_SIGNING_SECRET"); // sem Svix → auth só por header
Deno.env.set("WHATSAPP_CLOUD_APP_SECRET", WA_APP_SECRET);
Deno.env.set("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN", WA_VERIFY_TOKEN);

// ─── Captura dos handlers (stub de Deno.serve + import dinâmico) ─────────────
async function importHandlerCapturing(modulePath: string): Promise<EdgeHandler> {
  const target: { fn?: EdgeHandler } = {};
  // deno-lint-ignore no-explicit-any
  const anyDeno = Deno as unknown as Record<string, any>;
  const originalServe = anyDeno.serve;
  anyDeno.serve = (h: EdgeHandler) => {
    target.fn = h;
    return { finished: Promise.resolve(), addr: { port: 0 } };
  };
  try {
    await import(modulePath);
  } finally {
    anyDeno.serve = originalServe;
  }
  if (!target.fn) throw new Error(`handler não capturado em ${modulePath}`);
  return target.fn;
}

const emailHandler = await importHandlerCapturing("../../zapp-email-inbound-webhook/index.ts");
const waCloudHandler = await importHandlerCapturing("../../whatsapp-cloud-webhook/index.ts");

// ─── Helpers ─────────────────────────────────────────────────────────────────
function postReq(fn: string, body: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://zapp.atomicabr.com.br/functions/v1/${fn}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
  });
}

/** HMAC-SHA256 no formato que verifyHmacSignature espera: `sha256=<hex>`. */
async function hmacSha256(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return "sha256=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Envelope 422 do contract-kit (shape completo, para asserção forte). */
interface ContractErrorEnvelope {
  error: boolean;
  code: string;
  message: string;
  contract: string;
  details: Array<{ path: string; message: string }>;
}

// Tests com servidor/keep-alive vivos entre casos: sem sanitize de recursos/ops
// (o stub PostgREST e o pool do supabase-js atravessam testes por design).
const testOpts = { sanitizeResources: false, sanitizeOps: false } as const;

// ─── zapp-email-inbound-webhook ──────────────────────────────────────────────

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("email-inbound: payload fora do contrato → 422 com envelope canônico no JSON da resposta", testOpts, async () => {
  // Válido em shape (id/from presentes) mas viola o superRefine: to vazio,
  // subject vazio e nenhum corpo (text/html) — as 3 regras da etapa 23/D2.
  const payload = JSON.stringify({ id: "msg-etag68-1", from: "remetente@exemplo.com", to: [], subject: "" });
  const res = await emailHandler(postReq("zapp-email-inbound-webhook", payload, { "x-webhook-secret": EMAIL_SECRET }));
  const body = await res.json() as ContractErrorEnvelope;

  assertEquals(res.status, 422, `esperado 422, veio ${res.status}: ${JSON.stringify(body)}`);
  assertEquals(body.error, true);
  assertEquals(body.code, "contract_violation");
  assertEquals(body.contract, "zapp-email-inbound-webhook@v1");
  assertEquals(typeof body.message, "string");
  const paths = body.details.map((d) => d.path).sort();
  for (const expected of ["subject", "text", "to"]) {
    assert(paths.includes(expected), `details deveria citar "${expected}" — veio ${JSON.stringify(paths)}`);
  }
  // Gate herda CORS do endpoint (extraHeaders no parseOrReject).
  assertEquals(res.headers.get("access-control-allow-origin"), ORIGIN);
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("email-inbound: body não-JSON → 422 invalid_json (envelope canônico)", testOpts, async () => {
  const res = await emailHandler(postReq("zapp-email-inbound-webhook", "isto não é { json válido", { "x-webhook-secret": EMAIL_SECRET }));
  const body = await res.json() as ContractErrorEnvelope;

  assertEquals(res.status, 422);
  assertEquals(body.error, true);
  assertEquals(body.code, "invalid_json");
  assert(Array.isArray(body.details) && body.details.length > 0);
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("email-inbound: nenhum secret configurado → 503 fail-closed antes do gate", testOpts, async () => {
  Deno.env.delete("EMAIL_INBOUND_WEBHOOK_SECRET");
  try {
    const res = await emailHandler(postReq("zapp-email-inbound-webhook", "{}"));
    assertEquals(res.status, 503, "sem NENHUM mecanismo de auth configurado o webhook deve recusar (fail-closed)");
  } finally {
    Deno.env.set("EMAIL_INBOUND_WEBHOOK_SECRET", EMAIL_SECRET);
  }
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("email-inbound: secret errado no header → 401 antes do contrato", testOpts, async () => {
  const res = await emailHandler(
    postReq("zapp-email-inbound-webhook", JSON.stringify({ id: "x", from: "a@b.c", to: ["c@d.e"], subject: "s", text: "t" }), {
      "x-webhook-secret": "secret-errado",
    }),
  );
  assertEquals(res.status, 401);
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("email-inbound: happy-path mínimo → 200 {ok,emailId} + CORS; campo extra do provider é ACEITO (passthrough por design)", testOpts, async () => {
  // Campo extra desconhecido (`x-provider-custom`) deve passar — contrato
  // permissivo documentado (webhook externo, incidente 2026-07-03).
  const payload = JSON.stringify({
    id: "msg-etag68-happy",
    from: "Nome <remetente@exemplo.com>",
    to: ["destino@zapp.com.br"],
    subject: "Teste etapa 68",
    text: "corpo mínimo",
    x_provider_custom: { any: "coisa nova do Resend" },
  });
  const res = await emailHandler(postReq("zapp-email-inbound-webhook", payload, { "x-webhook-secret": EMAIL_SECRET }));
  const body = await res.json() as { ok?: boolean; emailId?: string };

  assertEquals(res.status, 200, `esperado 200, veio ${res.status}: ${JSON.stringify(body)}`);
  assertEquals(body.ok, true);
  assertEquals(body.emailId, EMAIL_ROW_ID, "emailId deve vir da linha retornada pelo insert (stub PostgREST)");
  assertEquals(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert((res.headers.get("content-type") ?? "").includes("application/json"));
});

// ─── whatsapp-cloud-webhook ──────────────────────────────────────────────────

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("wa-cloud: POST sem assinatura (APP_SECRET configurado) → 401 envelope invalid_signature", testOpts, async () => {
  const res = await waCloudHandler(postReq("whatsapp-cloud-webhook", JSON.stringify({ object: "whatsapp_business_account", entry: [] })));
  const body = await res.json() as { error?: boolean; code?: string; message?: string };

  assertEquals(res.status, 401);
  assertEquals(body.error, true);
  assertEquals(body.code, "invalid_signature"); // errorEnvelope (etapa 26), não string solta
  assertEquals(typeof body.message, "string");
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("wa-cloud: HMAC válido + object literal errado → 422 contract_violation com details", testOpts, async () => {
  const raw = JSON.stringify({ object: "telegram", entry: [] });
  const res = await waCloudHandler(
    postReq("whatsapp-cloud-webhook", raw, { "x-hub-signature-256": await hmacSha256(raw, WA_APP_SECRET) }),
  );
  const body = await res.json() as ContractErrorEnvelope;

  assertEquals(res.status, 422, `esperado 422, veio ${res.status}: ${JSON.stringify(body)}`);
  assertEquals(body.error, true);
  assertEquals(body.code, "contract_violation");
  assert(body.contract.startsWith("whatsapp-cloud-webhook@"), `contract label inesperado: ${body.contract}`);
  const paths = body.details.map((d) => d.path);
  assert(paths.includes("object"), `details deveria citar "object" — veio ${JSON.stringify(paths)}`);
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("wa-cloud: chave entry ausente → 422 (nullable ≠ optional: chave é obrigatória)", testOpts, async () => {
  const raw = JSON.stringify({ object: "whatsapp_business_account" });
  const res = await waCloudHandler(
    postReq("whatsapp-cloud-webhook", raw, { "x-hub-signature-256": await hmacSha256(raw, WA_APP_SECRET) }),
  );
  const body = await res.json() as ContractErrorEnvelope;

  assertEquals(res.status, 422);
  assertEquals(body.code, "contract_violation");
  assert(body.details.some((d) => d.path.includes("entry")), `details deveria citar "entry" — veio ${JSON.stringify(body.details)}`);
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("wa-cloud: happy-path benign (entry [] + campo extra) → 200 ok+benign com x-contract-version propagado", testOpts, async () => {
  // Campo top-level desconhecido é aceito (strip/permissivo — provider webhook).
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [], x_meta_extra: "campo novo da Meta" });
  const res = await waCloudHandler(
    postReq("whatsapp-cloud-webhook", raw, { "x-hub-signature-256": await hmacSha256(raw, WA_APP_SECRET) }),
  );
  const body = await res.json() as { ok?: boolean; benign?: boolean; processed?: number; requestId?: string };

  assertEquals(res.status, 200, `esperado 200, veio ${res.status}: ${JSON.stringify(body)}`);
  assertEquals(body.ok, true);
  assertEquals(body.benign, true, "entry vazio é notificação benigna da Meta (etapa 24) — nunca 422/retry-storm");
  assertEquals(body.processed, 0);
  // Bloco 5 (2026-08-21): headers de contrato propagados na resposta de sucesso.
  assertEquals(res.headers.get("x-contract-version"), "v1");
  assertEquals(res.headers.get("access-control-allow-origin"), ORIGIN);
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("wa-cloud: GET de verificação Meta ecoa hub.challenge com verify token válido", testOpts, async () => {
  const url = `https://zapp.atomicabr.com.br/functions/v1/whatsapp-cloud-webhook?hub.mode=subscribe&hub.verify_token=${WA_VERIFY_TOKEN}&hub.challenge=desafio-etag68`;
  const res = await waCloudHandler(new Request(url, { headers: { origin: ORIGIN } }));

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "desafio-etag68");
});

// Etapa 68 — integração via fetch contra handler real (PLANO-100-CONTRATOS-EDGE)
Deno.test("teardown: encerra o stub PostgREST local e restaura o env do processo", testOpts, async () => {
  await stubServer.shutdown();
  restoreEnvSnapshot();
  // Guard de higiene: se este assert falhar, alguém tocou env sem registrá-la
  // em ENV_TOUCHED — o vazamento quebra suítes vizinhas no mesmo processo.
  for (const [k, v] of envSnapshot) {
    assertEquals(Deno.env.get(k), v, `env "${k}" deve voltar ao estado pré-teste — registre a chave em ENV_TOUCHED e restaure via restoreEnvSnapshot()`);
  }
});
