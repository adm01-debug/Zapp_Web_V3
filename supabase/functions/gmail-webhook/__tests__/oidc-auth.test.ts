// gmail-webhook — auth OIDC do Pub/Sub push (item #8 da auditoria 22D, 2026-09-02).
// Rodar: deno test --allow-read --allow-env supabase/functions/gmail-webhook/__tests__/oidc-auth.test.ts
//
// Módulo isolado do inbound-mock.test.ts: aqui GMAIL_PUBSUB_OIDC_AUDIENCE está
// setado ANTES do import de index.ts, então o handler entra no ramo OIDC (audience
// configurado = única fonte de verdade, token de querystring aposentado).
import { assertEquals } from "jsr:@std/assert";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", { value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; }, writable: true, configurable: true });

const PUSH_TOKEN = "test-pubsub-token";
const AUDIENCE = "https://zapp.example/functions/v1/gmail-webhook";
const SERVICE_ACCOUNT = "gmail-push@zapp-web.iam.gserviceaccount.com";
const KID = "test-key-1";

for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SELFHOSTED_SUPABASE_ANON_KEY: "test-anon-key-123456",
  GMAIL_PUBSUB_TOPIC: "projects/zapp/topics/gmail-push",
  GMAIL_PUBSUB_TOKEN: PUSH_TOKEN,
  GMAIL_PUBSUB_OIDC_AUDIENCE: AUDIENCE,
  GMAIL_PUBSUB_OIDC_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
})) Deno.env.set(k, v);

const { publicKey, privateKey } = await jose.generateKeyPair("RS256");
const publicJwk = { ...(await jose.exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" };
// Par de chaves de um "atacante" — nunca publicado no JWKS mockado — para
// provar que a verificação de assinatura RS256 é real, não só estrutural.
const { privateKey: attackerPrivateKey } = await jose.generateKeyPair("RS256");

const J = { "content-type": "application/json" };
const Jres = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { ...J, ...headers } });

let account: Record<string, unknown> | null = null;
const gmailApiCalls: string[] = [];
let certsRequests = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const p = u.pathname;
  const m = init?.method ?? "GET";
  const single = (new Headers(init?.headers).get("accept") ?? "").includes("application/vnd.pgrst.object+json");
  if (p === "/oauth2/v3/certs") { certsRequests++; return Jres({ keys: [publicJwk] }); }
  if (p.endsWith("/auth/v1/user")) return Jres({ user: { id: "user-1", email: "u@example.com" } });
  if (p.endsWith("/email_accounts")) return Jres(single ? account : account ? [account] : []);
  if (p.endsWith("/email_watch_history") && m === "GET") return Jres(single ? null : []);
  if (p.endsWith("/email_watch_history") && m === "POST") return Jres([], 201);
  if (p.endsWith("/gmail_threads") && m === "POST") return Jres([], 201);
  if (p.endsWith("/gmail_threads") && m === "PATCH") return new Response(null, { status: 204 });
  if (p.endsWith("/gmail_threads") && m === "GET") return Jres(single ? { id: "th-1" } : [{ id: "th-1" }]);
  if (p.endsWith("/gmail_messages") && m === "POST") return Jres([], 201);
  if (p.endsWith("/gmail_messages") && m === "GET") return Jres([], 200, { "content-range": "0-0/1" });
  if (p.startsWith("/gmail/v1/users/me/history")) { gmailApiCalls.push("history"); return Jres({ history: [] }); }
  return Jres({ unhandled: true, url: String(input) }, 404);
}) as typeof fetch;

await import("../index.ts");

const ACCOUNT: Record<string, unknown> = {
  id: "acc-1", email: "bob@example.com", access_token: "stub-access-token",
  refresh_token: "stub-refresh-token", token_expires_at: "2099-01-01T00:00:00.000Z",
  client_id: null, client_secret: null,
};
const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const pushBody = () => ({
  message: { data: b64(JSON.stringify({ emailAddress: "bob@example.com", historyId: "h-200" })), messageId: "pm-1", publishTime: "2026-08-17T10:00:00.000Z" },
  subscription: "projects/zapp/subscriptions/gmail-push",
});
const push = (headers: Record<string, string> = {}, query = "") =>
  h(new Request(`http://mock.local/gmail-webhook${query}`, { method: "POST", body: JSON.stringify(pushBody()), headers: { ...J, ...headers } }));

const signToken = (
  overrides: Partial<{ iss: string; aud: string; email: string; emailVerified: boolean; exp: string; key: jose.KeyLike }> = {}
) =>
  new jose.SignJWT({
    email: overrides.email ?? SERVICE_ACCOUNT,
    email_verified: overrides.emailVerified ?? true,
  })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setIssuer(overrides.iss ?? "https://accounts.google.com")
    .setAudience(overrides.aud ?? AUDIENCE)
    .setExpirationTime(overrides.exp ?? "5m")
    .sign(overrides.key ?? privateKey);

Deno.test("gmail-webhook OIDC: audience configurado + sem Authorization header → 401 (token de querystring não basta mais)", async () => {
  account = { ...ACCOUNT };
  const res = await push({}, `?token=${PUSH_TOKEN}`);
  assertEquals(res.status, 401);
});

Deno.test("gmail-webhook OIDC: Authorization presente mas JWT inválido (assinatura errada) → 401", async () => {
  account = { ...ACCOUNT };
  const res = await push({ authorization: "Bearer garbage.not.a.jwt" });
  assertEquals(res.status, 401);
});

Deno.test("gmail-webhook OIDC: JWT válido mas aud errado → 401", async () => {
  account = { ...ACCOUNT };
  const token = await signToken({ aud: "https://outro-endpoint.example" });
  const res = await push({ authorization: `Bearer ${token}` });
  assertEquals(res.status, 401);
});

Deno.test("gmail-webhook OIDC: JWT estruturalmente válido mas assinado com chave errada → 401 (prova que a verificação RS256/JWKS é real)", async () => {
  account = { ...ACCOUNT };
  const token = await signToken({ key: attackerPrivateKey });
  const res = await push({ authorization: `Bearer ${token}` });
  assertEquals(res.status, 401);
});

Deno.test("gmail-webhook OIDC: JWT válido de outra identidade Google (email diferente da service account esperada) → 401", async () => {
  // Achado do review (cubic P1 / CodeRabbit): aud sozinho não autentica —
  // qualquer service account do Google pode pedir um ID token com o aud
  // configurado. Precisa pinar o email exato.
  account = { ...ACCOUNT };
  const token = await signToken({ email: "outra-conta@outro-projeto.iam.gserviceaccount.com" });
  const res = await push({ authorization: `Bearer ${token}` });
  assertEquals(res.status, 401);
});

Deno.test("gmail-webhook OIDC: JWT válido mas email_verified=false → 401", async () => {
  account = { ...ACCOUNT };
  const token = await signToken({ emailVerified: false });
  const res = await push({ authorization: `Bearer ${token}` });
  assertEquals(res.status, 401);
});

Deno.test("gmail-webhook OIDC: audience configurado sem service account (config parcial) → 500, nunca cai pro legado", async () => {
  Deno.env.delete("GMAIL_PUBSUB_OIDC_SERVICE_ACCOUNT");
  try {
    account = { ...ACCOUNT };
    const token = await signToken();
    const res = await push({ authorization: `Bearer ${token}` });
    assertEquals(res.status, 500);
  } finally {
    Deno.env.set("GMAIL_PUBSUB_OIDC_SERVICE_ACCOUNT", SERVICE_ACCOUNT);
  }
});

Deno.test("gmail-webhook OIDC: JWT válido (iss/aud/assinatura/email corretos) → passa da auth (200), JWKS do Google foi consultado", async () => {
  account = { ...ACCOUNT };
  const token = await signToken();
  const res = await push({ authorization: `Bearer ${token}` });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true }); // fixture sem messagesAdded — só valida que passou da auth e completou o fluxo
  assertEquals(gmailApiCalls, ["history"]);
  // Cumulativo (não resetado antes deste teste): createRemoteJWKSet cacheia a
  // chave por processo, então um reset local não força um novo fetch — o que
  // importa é provar que o endpoint mock foi consultado pelo menos uma vez em
  // todo o arquivo (se a verificação pulasse o JWKS por completo, os testes de
  // assinatura/email errados acima também não teriam pego o achado do cubic).
  assertEquals(certsRequests > 0, true);
});
