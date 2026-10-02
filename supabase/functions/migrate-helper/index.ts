// Edge function temporária para migração/recuperação de credenciais.
// Reintroduzida em 2026-09-10/11 (commits 3f96c06de/9835f08e8) para
// credential recovery — tinha sido removida no PR #666 por chave
// comprometida commitada no repo.
//
// Segurança (auditoria 22D, 2026-10-02):
//  - A chave agora vem de MIGRATE_HELPER_ACCESS_KEY (secret do runtime),
//    NUNCA de literal no repo — a anterior vazou no git (está no histórico)
//    e deve ser tratada como comprometida.
//  - Sem CORS `*`: endpoint é máquina→máquina (curl/CI), nunca chamado
//    pelo browser — remover ACAO bloqueia uso via página web hostil sem
//    afetar chamadores legítimos.
//  - Fail-closed: secret ausente => 503 (não deixa a função "aberta por
//    acidente" após deploy sem config).
//  - action=credentials retorna SERVICE_ROLE_KEY/DB_URL — após o uso
//    previsto, REMOVER a função do volume (ver docs/edge/reconciliacao-2026-08.md)
//    e rotacionar as credenciais expostas.

const ACCESS_KEY = Deno.env.get("MIGRATE_HELPER_ACCESS_KEY");
const headers = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-access-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (!ACCESS_KEY) return json({ error: "not_configured" }, 503);
  const key = req.headers.get("x-access-key");
  // Comparação em tempo constante (validação 5-agentes: !== vaza timing do
  // prefixo — a chave protege a exfiltração de SERVICE_ROLE_KEY/DB_URL).
  const timingSafeEqual = (a: string, b: string): boolean => {
    const x = new TextEncoder().encode(a);
    const y = new TextEncoder().encode(b);
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
  };
  if (!timingSafeEqual(key ?? "", ACCESS_KEY)) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "ping";

  try {
    if (action === "ping") {
      return json({ ok: true, project_ref: Deno.env.get("SUPABASE_URL") });
    }
    if (action === "credentials") {
      return json({
        url: Deno.env.get("SUPABASE_URL"),
        service_role: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        db_url: Deno.env.get("SUPABASE_DB_URL"),
      });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
